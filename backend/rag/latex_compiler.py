import os
import re
import io
import zipfile
import tempfile
import subprocess
from typing import Dict, Any, List, Tuple

# Path to the standalone tectonic executable
import shutil

TECTONIC_BIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", ".venv", "bin", "tectonic")
)
if not os.path.exists(TECTONIC_BIN):
    TECTONIC_BIN = shutil.which("tectonic") or "/usr/local/bin/tectonic"


def sanitize_latex_text(text: str) -> str:
    """
    Sanitizes raw LLM output text for robust compilation in XeTeX/LaTeX:
    - Escapes unescaped %, _, &, # outside of math mode and environments.
    - Replaces unicode typographic quotes and dashes with standard LaTeX syntax.
    - Protects existing LaTeX commands, inline math ($...$), and display math blocks ($$...$$, \\[...\\]).
    """
    if not text:
        return ""

    # Replace fancy unicode quotes and dashes
    s = text
    s = s.replace("“", "``").replace("”", "''")
    s = s.replace("‘", "`").replace("’", "'")
    s = s.replace("—", "---").replace("–", "--")
    s = s.replace("…", "...")

    # Protect math formulas with an ALPHANUMERIC token (no underscores, no percents, no hashes)
    math_blocks = []
    def save_math(match):
        idx = len(math_blocks)
        math_blocks.append(match.group(0))
        return f"SMATEMATHPHX{idx}XEND"

    math_pattern = re.compile(
        r"(\\begin\{(?:equation|align|gather)\*?\}.*?\\end\{(?:equation|align|gather)\*?\}|"
        r"\$\$[\s\S]*?\$\$|"
        r"\\\[[\s\S]*?\\\]|"
        r"(?<!\$)\$(?!\$)[^$\n]+?(?<!\$)\$(?!\$)|"
        r"\\\(.*?\\\))",
        re.DOTALL
    )
    s = math_pattern.sub(save_math, s)

    # Normalize mathematical/greek unicode symbols to LaTeX math mode (only outside protected math blocks!)
    s = s.replace("μ", r"$\mu$").replace("µ", r"$\mu$")
    s = s.replace("±", r"$\pm$").replace("≤", r"$\le$").replace("≥", r"$\ge$")
    s = s.replace("→", r"$\to$").replace("←", r"$\leftarrow$").replace("↔", r"$\leftrightarrow$")
    s = s.replace("×", r"$\times$").replace("÷", r"$\div$")
    s = s.replace("°", r"$^\circ$").replace("•", r"$\bullet$")
    s = s.replace("α", r"$\alpha$").replace("β", r"$\beta$").replace("γ", r"$\gamma$").replace("δ", r"$\delta$")

    # Escape special characters outside math
    s = re.sub(r"(?<!\\)%", r"\%", s)
    s = re.sub(r"(?<!\\)_", r"\_", s)
    s = re.sub(r"(?<!\\)&", r"\&", s)
    s = re.sub(r"(?<!\\)#", r"\#", s)

    # Restore math blocks
    for i, mb in enumerate(math_blocks):
        cleaned_mb = mb
        # Ensure no internal blank lines (\par) inside display math environments
        if cleaned_mb.startswith("$$") or cleaned_mb.startswith("\\[") or "\\begin{" in cleaned_mb:
            lines = [ln.strip() for ln in cleaned_mb.split("\n") if ln.strip()]
            cleaned_mb = "\n".join(lines)
        s = s.replace(f"SMATEMATHPHX{i}XEND", cleaned_mb)

    return s


def markdown_to_latex_fragment(md_text: str, default_sec_num: int = 1) -> str:
    """
    Converts a Markdown section body (with ### subheadings, **bold**, lists, math blocks, and tables)
    into clean, idiomatic LaTeX commands.
    """
    if not md_text:
        return ""

    # 1. Convert ```math ... ``` and ```latex ... ``` fenced blocks to display math \[ ... \]
    def repl_fenced(m):
        code = m.group(1).strip()
        return f"\n\n\\[\n{code}\n\\]\n\n"
    md_text = re.sub(r"```(?:math|latex)\s*\n([\s\S]*?)\n```", repl_fenced, md_text)

    # 2. Extract multi-line and display math blocks before splitting into lines
    display_math_blocks = []
    def extract_display_math(match):
        raw_block = match.group(0).strip()
        if raw_block.startswith("$$") and raw_block.endswith("$$"):
            inner = raw_block[2:-2].strip()
            inner_lines = [l.strip() for l in inner.split("\n") if l.strip()]
            cleaned = "\\[\n" + "\n".join(inner_lines) + "\n\\]"
        elif raw_block.startswith(r"\[") and raw_block.endswith(r"\]"):
            inner = raw_block[2:-2].strip()
            inner_lines = [l.strip() for l in inner.split("\n") if l.strip()]
            cleaned = "\\[\n" + "\n".join(inner_lines) + "\n\\]"
        else:
            inner_lines = [l.strip() for l in raw_block.split("\n") if l.strip()]
            cleaned = "\n".join(inner_lines)

        idx = len(display_math_blocks)
        display_math_blocks.append(cleaned)
        return f"\n\nSMATEDISPLAYMATHPHX{idx}XEND\n\n"

    display_math_pattern = re.compile(
        r"(\\begin\{(?:equation|align|gather)\*?\}.*?\\end\{(?:equation|align|gather)\*?\}|"
        r"\$\$[\s\S]*?\$\$|"
        r"\\\[[\s\S]*?\\\])",
        re.DOTALL
    )
    md_text = display_math_pattern.sub(extract_display_math, md_text)

    lines = md_text.split("\n")
    latex_lines = []
    in_table = False
    table_rows = []
    in_list = False

    for line in lines:
        trimmed = line.strip()

        # Handle display math placeholders
        if trimmed.startswith("SMATEDISPLAYMATHPHX") and trimmed.endswith("XEND"):
            if in_table and table_rows:
                latex_lines.append(render_latex_booktabs(table_rows))
                table_rows = []
                in_table = False
            if in_list:
                latex_lines.append(r"\end{itemize}")
                in_list = False
            latex_lines.append(trimmed)
            latex_lines.append("")
            continue

        # Handle Markdown Tables
        if trimmed.startswith("|") and (trimmed.endswith("|") if not hasattr(trimmed, 'endsWith') else trimmed.endswith("|")):
            # Check if separator row like |---|---|
            if re.match(r"^\|[\s\-:]+([\|\s\-:]+)*\|$", trimmed):
                continue
            cells = [c.strip() for c in trimmed.split("|")[1:-1]]
            in_table = True
            table_rows.append(cells)
            continue
        else:
            if in_table and table_rows:
                latex_lines.append(render_latex_booktabs(table_rows))
                table_rows = []
                in_table = False

        # Handle List items
        if trimmed.startswith("- ") or trimmed.startswith("* "):
            if not in_list:
                latex_lines.append(r"\begin{itemize}")
                in_list = True
            item_content = trimmed[2:].strip()
            item_latex = convert_inline_markdown(sanitize_latex_text(item_content))
            latex_lines.append(f"  \\item {item_latex}")
            continue
        else:
            if in_list:
                latex_lines.append(r"\end{itemize}")
                in_list = False

        if not trimmed:
            latex_lines.append("")
            continue

        # Handle Subsections (### or ####)
        if trimmed.startswith("### "):
            sub_title = trimmed[4:].strip()
            # Clean any leading numbers if already present like 1.1 or 2.1
            sub_title = re.sub(r"^[\d\.]+\s*", "", sub_title)
            latex_lines.append(f"\\subsection{{{sanitize_latex_text(sub_title)}}}")
            continue
        elif trimmed.startswith("#### "):
            sub_sub_title = trimmed[5:].strip()
            sub_sub_title = re.sub(r"^[\d\.]+\s*", "", sub_sub_title)
            latex_lines.append(f"\\subsubsection{{{sanitize_latex_text(sub_sub_title)}}}")
            continue
        elif trimmed.startswith("## ") or trimmed.startswith("# "):
            # We skip duplicate section headers as they are handled by main sections
            continue

        # Regular Paragraph text
        clean_p = convert_inline_markdown(sanitize_latex_text(trimmed))
        latex_lines.append(clean_p)
        latex_lines.append("")

    if in_table and table_rows:
        latex_lines.append(render_latex_booktabs(table_rows))
    if in_list:
        latex_lines.append(r"\end{itemize}")

    result = "\n".join(latex_lines)

    # Restore display math blocks
    for i, mb in enumerate(display_math_blocks):
        result = result.replace(f"SMATEDISPLAYMATHPHX{i}XEND", mb)

    return result


def convert_inline_markdown(text: str) -> str:
    """Transforms **bold**, *italics*, and [X] bracket citations into LaTeX equivalents."""
    if not text:
        return ""
    # **bold** -> \textbf{...}
    out = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    # *italic* -> \textit{...}
    out = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"\\textit{\1}", out)
    # Bracket citations like [1] or [1, 2] or [1, p. 4] -> \cite{doc_1} or formal bracket
    # For standalone monographs, [1] is clean numbered bracket citation
    return out


def render_latex_booktabs(rows: List[List[str]]) -> str:
    """Renders table cells as a clean LaTeX booktabs tabular environment."""
    if not rows:
        return ""
    col_count = max(len(r) for r in rows)

    if col_count == 5:
        # 5-column systematic literature review matrix:
        # Col 1: Paper / Citation (0.90\hsize)
        # Col 2: Core Methodology & Architecture (1.05\hsize)
        # Col 3: Primary Datasets / Benchmarks (0.95\hsize)
        # Col 4: Key Strengths (1.05\hsize)
        # Col 5: Critical Limitations (1.05\hsize)
        col_spec = (
            ">{\\raggedright\\arraybackslash\\hsize=0.90\\hsize}X "
            ">{\\raggedright\\arraybackslash\\hsize=1.05\\hsize}X "
            ">{\\raggedright\\arraybackslash\\hsize=0.95\\hsize}X "
            ">{\\raggedright\\arraybackslash\\hsize=1.05\\hsize}X "
            ">{\\raggedright\\arraybackslash\\hsize=1.05\\hsize}X"
        )
    elif col_count > 4:
        col_spec = " ".join([">{\\raggedright\\arraybackslash}X"] * col_count)
    else:
        col_spec = "l " * col_count if col_count <= 3 else " ".join([">{\\raggedright\\arraybackslash}X"] * col_count)

    header = rows[0]
    body = rows[1:]

    def format_cell(c: str) -> str:
        cell_tex = convert_inline_markdown(sanitize_latex_text(c))
        # Allow break points on underscores and hyphens so long tokens/filenames wrap cleanly
        cell_tex = cell_tex.replace(r"\_", r"\_\allowbreak ")
        cell_tex = re.sub(r"(?<=[a-zA-Z0-9])-(?=[a-zA-Z0-9])", lambda m: "-\\allowbreak ", cell_tex)
        return cell_tex

    header_tex = " & ".join([f"\\textbf{{{format_cell(c)}}}" for c in header]) + r" \\"
    body_tex_lines = []
    for r in body:
        padded = r + ["-"] * (col_count - len(r))
        row_str = " & ".join([format_cell(c) for c in padded]) + r" \\"
        body_tex_lines.append(f"  {row_str}")

    if col_count >= 4:
        begin_env = r"\begin{tabularx}{\textwidth}{" + col_spec.strip() + r"}"
        end_env = r"\end{tabularx}"
    else:
        begin_env = r"\begin{tabular}{" + col_spec.strip() + r"}"
        end_env = r"\end{tabular}"

    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        r"\small",
        r"\renewcommand{\arraystretch}{1.25}",
        r"\setlength{\tabcolsep}{4pt}",
        begin_env,
        r"\toprule",
        f"  {header_tex}",
        r"\midrule",
        "\n".join(body_tex_lines),
        r"\bottomrule",
        end_env,
        r"\caption{Comparative Synthesis of Methodologies and Empirical Findings}",
        r"\end{table}"
    ]
    return "\n".join(lines)


def generate_bibtex_content(doc_names: List[str]) -> Tuple[str, List[Dict[str, str]]]:
    """
    Generates a formal BibTeX file and mapped bibliography entries.
    Parses real academic titles, authors, and years from document names where available.
    """
    entries = []
    bibtex_lines = []

    for idx, doc in enumerate(doc_names, 1):
        clean_name = doc.replace(".pdf", "").replace(".docx", "").replace(".txt", "")
        # Try to extract clean author and title
        # Examples: "schiaffino-et-al-2020-molecular-mechanisms..." or "He_2015_Deep_Residual_Learning..."
        year_match = re.search(r"\b(19\d\d|20\d\d)\b", clean_name)
        year = year_match.group(1) if year_match else "2024"

        # Key: doc1, doc2 or author_year
        cite_key = f"doc_{idx}"
        title = clean_name.replace("-", " ").replace("_", " ").title()

        # Check for author names in filename
        author = "ScholarsMate Indexed Author(s)"
        if "et-al" in clean_name.lower() or "et_al" in clean_name.lower():
            author_prefix = re.split(r"[-_]et[-_]al", clean_name, flags=re.IGNORECASE)[0]
            author = f"{author_prefix.replace('_', ' ').replace('-', ' ').title()} et al."
        elif re.match(r"^[A-Za-z]+[-_]\d{4}", clean_name):
            author_prefix = clean_name.split("_")[0].split("-")[0]
            author = author_prefix.title()

        bib_entry = f"""@article{{{cite_key},
  author    = {{{author}}},
  title     = {{{title}}},
  year      = {{{year}}},
  journal   = {{ScholarsMate Workspace Primary Corpus}},
  note      = {{Indexed Primary Research Work [{idx}]}}
}}"""
        bibtex_lines.append(bib_entry)
        entries.append({
            "key": cite_key,
            "number": idx,
            "author": author,
            "title": title,
            "year": year,
            "filename": doc
        })

    return "\n\n".join(bibtex_lines), entries


def build_full_latex_document(monograph: Dict[str, Any]) -> Tuple[str, Dict[str, str], str]:
    """
    Constructs the complete master LaTeX project:
    - Returns (main_tex_string, section_files_dict, bibtex_string)
    """
    title = sanitize_latex_text(monograph.get("title", "Comprehensive Literature Review Monograph"))
    abstract_text = sanitize_latex_text(
        monograph.get("abstract") or
        "This monograph presents an integrative, systematic synthesis of conceptual frameworks, architectural paradigms, empirical benchmarks, and unresolved limitations across primary research works indexed in the ScholarsMate workspace."
    )
    focus = sanitize_latex_text(monograph.get("research_focus", ""))
    doc_names = monograph.get("doc_names", [])

    bibtex_content, bib_entries = generate_bibtex_content(doc_names)

    # Document preamble matching publication standards (LaTeX article class)
    preamble = r"""\documentclass[11pt,a4paper]{article}

% --- Core Academic Typesetting Packages ---
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{tabularx}
\usepackage{setspace}
\onehalfspacing

% --- Hyperlinks and Metadata ---
\usepackage{hyperref}
\hypersetup{
    colorlinks=true,
    linkcolor=black,
    citecolor=black,
    urlcolor=blue,
    pdftitle={""" + title + r"""},
    pdfauthor={ScholarsMate Automated Systematic Synthesis Engine}
}

% --- Centered Title Header ---
\title{
    \vspace{-1.5cm}
    \normalfont\small\bfseries ScholarsMate Academic Monograph Series\\[0.8cm]
    \LARGE \textbf{""" + title + r"""}
}

\author{
    \textbf{ScholarsMate Automated Systematic Synthesis Engine}\\
    \textit{Corpus Synthesis across """ + str(len(doc_names)) + r""" Primary Research Works}
}

\date{\today}

\begin{document}

\maketitle

% --- Abstract ---
\begin{abstract}
\noindent
""" + abstract_text + (r"""\\[0.3cm]
\textbf{Keywords \& Focus Directive:} \textit{""" + focus + r"""}""" if focus else "") + (r"""\\[0.15cm]
\textbf{Primary Indexed Corpus:} \textit{""" + sanitize_latex_text(", ".join(doc_names)) + r"""}""" if doc_names else "") + r"""
\end{abstract}

\clearpage

% --- Table of Contents ---
\tableofcontents
\clearpage
"""

    section_files = {}
    sections = monograph.get("sections", [])
    body_includes = []

    for idx, sec in enumerate(sections, 1):
        sec_title = sanitize_latex_text(sec.get("title", f"Section {idx}"))
        sec_filename = f"sec{idx}_{re.sub(r'[^a-zA-Z0-9]', '_', sec_title).lower()[:20]}.tex"
        sec_content_raw = sec.get("content", "")

        sec_body_latex = markdown_to_latex_fragment(sec_content_raw, default_sec_num=idx)

        # Build individual section file
        sec_file_text = f"\\section{{{sec_title}}}\n\\label{{sec:{idx}}}\n\n{sec_body_latex}\n"
        section_files[sec_filename] = sec_file_text
        body_includes.append(f"\\clearpage\n\\input{{sections/{sec_filename}}}")

    # Comparative Matrix Table as dedicated chapter/section
    if monograph.get("matrix_table"):
        matrix_sec_num = len(sections) + 1
        matrix_title = sanitize_latex_text("Systematic Methodological Matrix")
        matrix_filename = f"sec{matrix_sec_num}_methodological_matrix.tex"
        matrix_latex = markdown_to_latex_fragment(monograph.get("matrix_table"), default_sec_num=matrix_sec_num)
        matrix_intro = (
            "This section presents a systematic comparative matrix synthesizing "
            "core methodological architectures, empirical cohorts, primary benchmark findings, "
            "and critical limitations across all indexed works in the ScholarsMate workspace corpus.\n\n"
        )
        matrix_file_text = f"\\section{{{matrix_title}}}\n\\label{{sec:matrix}}\n\n{matrix_intro}{matrix_latex}\n"
        section_files[matrix_filename] = matrix_file_text
        body_includes.append(f"\\clearpage\n\\input{{sections/{matrix_filename}}}")

    # Conclusion section
    if monograph.get("conclusion"):
        conc_sec_num = len(sections) + (2 if monograph.get("matrix_table") else 1)
        conc_title = sanitize_latex_text("Integrative Conclusion & Strategic Roadmap")
        conc_filename = f"sec{conc_sec_num}_conclusion.tex"
        conc_body = markdown_to_latex_fragment(monograph.get("conclusion"))
        conc_file_text = f"\\section{{{conc_title}}}\n\\label{{sec:conclusion}}\n\n{conc_body}\n"
        section_files[conc_filename] = conc_file_text
        body_includes.append(f"\\clearpage\n\\input{{sections/{conc_filename}}}")

    # Bibliography block (\begin{thebibliography} or BibTeX)
    bib_latex = [r"\clearpage", r"\begin{thebibliography}{99}"]
    for entry in bib_entries:
        bib_latex.append(
            f"\\bibitem{{{entry['key']}}} {entry['author']}. \\textit{{{entry['title']}}}. {entry['year']}. ScholarsMate Primary Indexed Corpus [{entry['number']}]."
        )
    bib_latex.append(r"\end{thebibliography}")

    closing = "\n\n" + "\n\n".join(body_includes) + "\n\n" + "\n".join(bib_latex) + "\n\n\\end{document}\n"
    main_tex = preamble + closing

    return main_tex, section_files, bibtex_content


def compile_monograph_to_pdf_bytes(monograph: Dict[str, Any]) -> bytes:
    """
    Compiles a monograph into native vector PDF bytes using Tectonic.
    Executes in a safe isolated temporary directory and returns raw PDF bytes.
    """
    main_tex, section_files, bibtex_content = build_full_latex_document(monograph)

    with tempfile.TemporaryDirectory() as tmpdir:
        sections_dir = os.path.join(tmpdir, "sections")
        os.makedirs(sections_dir, exist_ok=True)

        # Write master main.tex
        main_path = os.path.join(tmpdir, "main.tex")
        with open(main_path, "w", encoding="utf-8") as f:
            f.write(main_tex)

        # Write individual section files
        for sec_filename, sec_content in section_files.items():
            sec_path = os.path.join(sections_dir, sec_filename)
            with open(sec_path, "w", encoding="utf-8") as f:
                f.write(sec_content)

        # Write references.bib
        bib_path = os.path.join(tmpdir, "references.bib")
        with open(bib_path, "w", encoding="utf-8") as f:
            f.write(bibtex_content)

        # Provide clean fontconfig configuration to avoid corrupted system fonts (e.g. icomoon null byte panic)
        fc_xml = """<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts/liberation</dir>
  <cachedir>/tmp/fc-cache-smate</cachedir>
</fontconfig>
"""
        fc_conf_path = os.path.join(tmpdir, "fonts.conf")
        with open(fc_conf_path, "w", encoding="utf-8") as f:
            f.write(fc_xml)

        # Ensure complete font map by patching master pdftex.map with available physical font files
        bundle_root = os.path.expanduser("~/.cache/tectonic/bundles/data")
        base_map = ""
        if os.path.exists(bundle_root):
            for b_hash in os.listdir(bundle_root):
                master_map = os.path.join(bundle_root, b_hash, "pdftex.map")
                if os.path.exists(master_map):
                    try:
                        with open(master_map, "r", encoding="utf-8") as f:
                            base_map = f.read()
                    except Exception:
                        pass
                candidate_tfm = os.path.join(bundle_root, b_hash, "ec-lmr10.tfm")
                if os.path.exists(candidate_tfm):
                    import shutil
                    for s in [5, 6, 7, 8, 9, 11, 14]:
                        target_tfm = os.path.join(tmpdir, f"ec-lmr{s}.tfm")
                        if not os.path.exists(target_tfm):
                            try:
                                shutil.copyfile(candidate_tfm, target_tfm)
                            except Exception:
                                pass
                if base_map:
                    break

        # Patch missing sub-size fonts to map to existing physical fonts in the bundle
        patched_map = base_map or ""
        patched_map = re.sub(r"<cmr\d+\.pfb", "<cmr10.pfb", patched_map)
        patched_map = re.sub(r"<cmmi\d+\.pfb", "<cmmi10.pfb", patched_map)
        patched_map = re.sub(r"<cmsy\d+\.pfb", "<cmsy10.pfb", patched_map)
        patched_map = re.sub(r"<cmti\d+\.pfb", "<lmri10.pfb", patched_map)
        patched_map = re.sub(r"<cmbx\d+\.pfb", "<lmbx10.pfb", patched_map)
        patched_map = re.sub(r"<lmr\d+\.pfb", "<lmr10.pfb", patched_map)
        patched_map = re.sub(r"<lmri\d+\.pfb", "<lmri10.pfb", patched_map)
        patched_map = re.sub(r"<lmbx\d+\.pfb", "<lmbx10.pfb", patched_map)

        extra_entries = """
cmr8 CMR10 <cmr10.pfb
cmr7 CMR10 <cmr10.pfb
cmr6 CMR10 <cmr10.pfb
cmr5 CMR10 <cmr10.pfb
cmsy8 CMSY10 <cmsy10.pfb
cmsy7 CMSY10 <cmsy10.pfb
cmsy6 CMSY10 <cmsy10.pfb
cmsy5 CMSY10 <cmsy10.pfb
cmmi7 CMMI10 <cmmi10.pfb
cmmi6 CMMI10 <cmmi10.pfb
cmmi5 CMMI10 <cmmi10.pfb
"""
        map_path = os.path.join(tmpdir, "pdftex.map")
        with open(map_path, "w", encoding="utf-8") as f:
            f.write(patched_map + "\n" + extra_entries)

        # Execute Tectonic compiler
        actual_bin = TECTONIC_BIN if os.path.exists(TECTONIC_BIN) else (shutil.which("tectonic") or "/usr/local/bin/tectonic")
        cmd = [actual_bin, "main.tex"]
        run_env = os.environ.copy()
        run_env["FONTCONFIG_FILE"] = fc_conf_path
        try:
            res = subprocess.run(
                cmd,
                cwd=tmpdir,
                env=run_env,
                capture_output=True,
                text=True,
                timeout=30
            )
        except Exception as e:
            raise RuntimeError(f"Tectonic execution failed to launch: {str(e)}")

        pdf_path = os.path.join(tmpdir, "main.pdf")
        if res.returncode != 0 or not os.path.exists(pdf_path):
            combined_log = (res.stderr or "") + "\n" + (res.stdout or "")
            cleaned_log_lines = [
                line for line in combined_log.split("\n")
                if "Fontconfig warning" not in line and "invalid constant used" not in line and "invalid attribute" not in line
            ]
            error_log = "\n".join(cleaned_log_lines).strip()
            tail_error = error_log[-1200:] if len(error_log) > 1200 else error_log
            raise RuntimeError(f"Tectonic LaTeX compilation error (code {res.returncode}):\n{tail_error}")

        with open(pdf_path, "rb") as pdf_file:
            pdf_bytes = pdf_file.read()

        return pdf_bytes


def create_latex_project_zip_bytes(monograph: Dict[str, Any]) -> bytes:
    """
    Packages the complete master LaTeX project (main.tex, sections/, references.bib)
    into an in-memory ZIP archive ready for Overleaf or local compilation.
    """
    main_tex, section_files, bibtex_content = build_full_latex_document(monograph)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # Write main.tex
        z.writestr("main.tex", main_tex)

        # Write individual section files in sections/
        for sec_filename, sec_content in section_files.items():
            z.writestr(f"sections/{sec_filename}", sec_content)

        # Write references.bib
        z.writestr("references.bib", bibtex_content)

        # Add a README.md for Overleaf & TeXStudio users
        readme = f"""# {monograph.get('title', 'ScholarsMate Literature Review')}
Synthesized automatically by ScholarsMate Academic Synthesis Engine.

## How to Compile
- **Overleaf:** Upload this ZIP directly to Overleaf (New Project -> Upload Project).
- **Local XeLaTeX / pdflatex:**
  ```bash
  tectonic main.tex
  # OR
  pdflatex main.tex && bibtex main && pdflatex main.tex
  ```
"""
        z.writestr("README.md", readme)

    buf.seek(0)
    return buf.getvalue()
