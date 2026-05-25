from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "試題"
ANSWER_DIR = ROOT / "答案"
DATA_DIR = ROOT / "data"
YEARS = [110, 111, 112, 113, 114]


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def clean_line(line: str) -> str:
    return " ".join(line.replace("\uf06c", "⚫").strip().split())


def parse_questions(year: int, path: Path) -> list[dict]:
    lines = [clean_line(line) for line in extract_pdf_text(path).splitlines()]
    questions: list[list[str]] = []
    current: list[str] | None = None
    expected = 1

    for line in lines:
        if not line or re.fullmatch(r"\d+", line):
            continue

        start = re.match(rf"^{expected}\s*[.．]\s*(.*)$", line)
        if start:
            if current:
                questions.append(current)
            current = [start.group(1).strip()]
            expected += 1
            continue

        if current is not None:
            current.append(line)

    if current:
        questions.append(current)

    parsed: list[dict] = []
    for number, raw_lines in enumerate(questions, start=1):
        question_lines: list[str] = []
        options: dict[str, list[str]] = {}
        current_option: str | None = None

        for line in raw_lines:
            option_start = re.match(r"^\(([ABCD])\)\s*(.*)$", line)
            if option_start:
                current_option = option_start.group(1)
                options[current_option] = [option_start.group(2).strip()]
            elif current_option:
                options[current_option].append(line)
            else:
                question_lines.append(line)

        parsed.append(
            {
                "year": year,
                "questionNumber": number,
                "questionText": " ".join(question_lines).strip(),
                "options": {
                    label: " ".join(options.get(label, [])).strip()
                    for label in ["A", "B", "C", "D"]
                },
                "sourceQuestionPdf": str(path.relative_to(ROOT)).replace("\\", "/"),
            }
        )

    return parsed


def parse_answers(path: Path) -> dict[int, str]:
    answers: dict[int, str] = {}
    for raw_line in extract_pdf_text(path).splitlines():
        line = clean_line(raw_line)
        match = re.match(r"^(\d{1,2})\s+(.+?)\s+(\d{1,2})\s+(.+)$", line)
        if not match:
            continue

        q1, a1, q2, a2 = match.groups()
        answers[int(q1)] = a1.strip()
        answers[int(q2)] = a2.strip()

    return answers


def answer_rule(answer: str) -> tuple[str, list[str]]:
    if "一律給分" in answer:
        return "all", ["A", "B", "C", "D"]

    labels = re.findall(r"[ABCD]", answer)
    unique_labels = []
    for label in labels:
        if label not in unique_labels:
            unique_labels.append(label)

    if len(unique_labels) > 1:
        return "multi", unique_labels
    if len(unique_labels) == 1:
        return "single", unique_labels
    return "unknown", []


def build() -> tuple[list[dict], dict]:
    all_questions: list[dict] = []
    report = {"years": {}, "issues": [], "status": "ok"}

    for year in YEARS:
        question_pdf = QUESTION_DIR / f"{year}年試題.pdf"
        answer_pdf = ANSWER_DIR / f"{year}答案.pdf"
        year_report = {
            "questionPdf": str(question_pdf.relative_to(ROOT)).replace("\\", "/"),
            "answerPdf": str(answer_pdf.relative_to(ROOT)).replace("\\", "/"),
            "questionCount": 0,
            "answerCount": 0,
            "exceptions": [],
            "issues": [],
        }

        if not question_pdf.exists():
            year_report["issues"].append(f"找不到試題 PDF：{question_pdf.name}")
        if not answer_pdf.exists():
            year_report["issues"].append(f"找不到答案 PDF：{answer_pdf.name}")

        if year_report["issues"]:
            report["years"][str(year)] = year_report
            continue

        questions = parse_questions(year, question_pdf)
        answers = parse_answers(answer_pdf)
        year_report["questionCount"] = len(questions)
        year_report["answerCount"] = len(answers)

        if len(questions) != 50:
            year_report["issues"].append(f"試題解析數量為 {len(questions)}，預期 50。")
        if len(answers) != 50:
            year_report["issues"].append(f"答案解析數量為 {len(answers)}，預期 50。")

        question_numbers = {item["questionNumber"] for item in questions}
        answer_numbers = set(answers)
        missing_answers = sorted(question_numbers - answer_numbers)
        missing_questions = sorted(answer_numbers - question_numbers)
        if missing_answers:
            year_report["issues"].append(f"缺少答案題號：{missing_answers}")
        if missing_questions:
            year_report["issues"].append(f"答案沒有對應試題：{missing_questions}")

        for question in questions:
            number = question["questionNumber"]
            answer = answers.get(number)
            if answer is None:
                continue

            score_mode, accepted = answer_rule(answer)
            if score_mode == "unknown":
                year_report["issues"].append(f"第 {number} 題答案無法解析：{answer}")
            elif score_mode in {"multi", "all"}:
                year_report["exceptions"].append(
                    {
                        "questionNumber": number,
                        "officialAnswer": answer,
                        "scoreMode": score_mode,
                        "acceptedAnswers": accepted,
                    }
                )

            missing_options = [label for label in accepted if label not in question["options"]]
            if missing_options:
                year_report["issues"].append(
                    f"第 {number} 題答案 {answer} 包含不存在的選項：{missing_options}"
                )

            if any(not question["options"][label] for label in ["A", "B", "C", "D"]):
                year_report["issues"].append(f"第 {number} 題選項解析不完整。")

            question["correctAnswer"] = answer
            question["acceptedAnswers"] = accepted
            question["scoreMode"] = score_mode
            question["sourceAnswerPdf"] = str(answer_pdf.relative_to(ROOT)).replace("\\", "/")
            all_questions.append(question)

        report["years"][str(year)] = year_report

    for year, year_report in report["years"].items():
        for issue in year_report["issues"]:
            report["issues"].append(f"{year} 年：{issue}")

    if report["issues"]:
        report["status"] = "failed"

    return all_questions, report


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    questions, report = build()

    if report["status"] != "ok":
        (DATA_DIR / "verification-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        raise SystemExit("PDF 解析驗證失敗，請查看 data/verification-report.json。")

    (DATA_DIR / "questions.json").write_text(
        json.dumps({"generatedFrom": "provided PDFs", "questions": questions}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (ROOT / "questions-data.js").write_text(
        "window.QUIZ_DATA = "
        + json.dumps({"generatedFrom": "provided PDFs", "questions": questions}, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    (DATA_DIR / "verification-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Generated {len(questions)} questions.")
    print("Verification status: ok")


if __name__ == "__main__":
    main()
