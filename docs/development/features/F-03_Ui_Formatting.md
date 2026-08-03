# Feature: Chat Interface & Citation Badges (F-03)

## 1. Overview
* **Status:** Complete
* **Priority:** Medium
* **Module:** Module 4 — Frontend UI/UX Architecture

## 2. Purpose
Renders AI responses directly on the pitch-black page background with borderless typography, spacious line height, and interactive source attribution badges instead of heavy container cards.

## 3. Requirements
* **FR-03.1:** AI responses shall not be enclosed in dark container boxes.
* **FR-03.2:** Markdown headings, lists, bold text, and blockquotes shall follow styled `@tailwindcss/typography` standards.
* **FR-03.3:** Citation sources in `sources_used` shall be deduplicated by `(doc_name, page_number)` and rendered as amber pill badges at the bottom of the response.

## 4. Technical Implementation
* **Frontend:** `src/components/chat/ChatMessage.jsx` using `ReactMarkdown`.

## 5. University Mapping
* **SRS Requirement:** FR-03 (Interactive Markdown Interface)
* **SDD Component:** Presentation Layer