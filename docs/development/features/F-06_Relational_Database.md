# Feature: Relational Database(F-06)

## 1. Overview
* **Status:** Backlog
* **Priority:** High
* **Module:** Module 3 — Persistence Layer & Workspace Management

## 2. Purpose
Transitions ScholarsMate from ephemeral session state to a persistent database so workspaces, document lists, and chat thread history survive application/browser restarts.

## 3. Requirements
* **FR-06.1:** Database schema shall include tables for `Workspaces`, `Documents`, and `ChatMessages`.
* **FR-06.2:** Switching workspaces in the UI shall dynamically load saved chat threads and vector collections.
* **FR-06.3:** Deleting a workspace shall clean up both relational database rows and ChromaDB vector collections.

## 4. Technical Implementation
* **Backend:** Python `SQLAlchemy` ORM + SQLite database file.

## 5. University Mapping
* **SRS Requirement:** FR-06 (Data Persistence & Workspace Lifecycle)
* **SDD Component:** Database & Storage Layer