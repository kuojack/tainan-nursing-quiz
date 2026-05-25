const state = {
  questions: [],
  byYear: new Map(),
  selectedYear: null,
  answers: new Map(),
};

const summary = document.querySelector("#summary");
const yearButtons = document.querySelector("#year-buttons");
const quizPanel = document.querySelector("#quiz-panel");
const resultPanel = document.querySelector("#result-panel");
const quizForm = document.querySelector("#quiz-form");
const quizYear = document.querySelector("#quiz-year");
const quizTitle = document.querySelector("#quiz-title");
const resultYear = document.querySelector("#result-year");
const resultTitle = document.querySelector("#result-title");
const scoreBox = document.querySelector("#score-box");
const wrongList = document.querySelector("#wrong-list");
const progress = document.querySelector("#progress");
const progressText = document.querySelector("#progress-text");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionText(question, label) {
  return `${label}. ${question.options[label]}`;
}

function isCorrect(question, answer) {
  if (question.scoreMode === "all") {
    return true;
  }
  return question.acceptedAnswers.includes(answer);
}

function updateProgress() {
  const total = state.byYear.get(state.selectedYear)?.length ?? 0;
  const answered = state.answers.size;
  progress.max = total;
  progress.value = answered;
  progressText.textContent = `${answered} / ${total}`;
}

function renderYearButtons() {
  yearButtons.innerHTML = "";
  [...state.byYear.keys()].sort((a, b) => a - b).forEach((year) => {
    const button = document.createElement("button");
    button.className = "year-button";
    button.type = "button";
    button.textContent = `${year} 年`;
    button.addEventListener("click", () => startQuiz(year));
    yearButtons.append(button);
  });
}

function renderQuiz() {
  const questions = state.byYear.get(state.selectedYear) ?? [];
  quizYear.textContent = `${state.selectedYear} 年試題`;
  quizTitle.textContent = `共 ${questions.length} 題`;
  quizForm.innerHTML = questions
    .map((question) => {
      const optionHtml = ["A", "B", "C", "D"]
        .map((label) => {
          const inputId = `q-${question.year}-${question.questionNumber}-${label}`;
          return `
            <label class="option" for="${inputId}">
              <input id="${inputId}" type="radio" name="q-${question.questionNumber}" value="${label}">
              <span>${escapeHtml(optionText(question, label))}</span>
            </label>
          `;
        })
        .join("");

      return `
        <article class="question">
          <div class="meta">${question.year} 年｜第 ${question.questionNumber} 題</div>
          <h3>${escapeHtml(question.questionText)}</h3>
          <div class="options">${optionHtml}</div>
        </article>
      `;
    })
    .join("");

  quizForm.onchange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    const number = Number(event.target.name.replace("q-", ""));
    state.answers.set(number, event.target.value);
    updateProgress();
  };

  updateProgress();
}

function startQuiz(year) {
  state.selectedYear = year;
  state.answers = new Map();
  resultPanel.classList.add("hidden");
  quizPanel.classList.remove("hidden");
  renderQuiz();
  quizPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResults() {
  const questions = state.byYear.get(state.selectedYear) ?? [];
  const wrong = [];
  let correctCount = 0;

  questions.forEach((question) => {
    const userAnswer = state.answers.get(question.questionNumber);
    if (isCorrect(question, userAnswer)) {
      correctCount += 1;
    } else {
      wrong.push({ question, userAnswer });
    }
  });

  resultYear.textContent = `${state.selectedYear} 年試題`;
  resultTitle.textContent = `測驗結果`;
  scoreBox.innerHTML = `
    <div>得分：<strong>${correctCount * 2}</strong> / ${questions.length * 2}</div>
    <div>答對：${correctCount} 題，答錯或未作答：${wrong.length} 題</div>
  `;

  if (wrong.length === 0) {
    wrongList.innerHTML = `<p>沒有錯題。</p>`;
  } else {
    wrongList.innerHTML = wrong.map(({ question, userAnswer }) => {
      const userText = userAnswer ? escapeHtml(optionText(question, userAnswer)) : "<span class=\"missing\">未作答</span>";
      const accepted = question.scoreMode === "all"
        ? "一律給分"
        : question.acceptedAnswers.map((label) => escapeHtml(optionText(question, label))).join("；");
      const optionReview = ["A", "B", "C", "D"].map((label) => {
        const isUser = userAnswer === label;
        const isAccepted = question.acceptedAnswers.includes(label);
        const classes = [
          "review-option",
          isUser ? "is-user" : "",
          isAccepted ? "is-correct" : "",
        ].filter(Boolean).join(" ");
        const tags = [
          isUser ? "<span class=\"option-tag user-tag\">你的答案</span>" : "",
          isAccepted ? "<span class=\"option-tag correct-tag\">正確答案</span>" : "",
        ].join("");

        return `
          <li class="${classes}">
            <div class="review-option-text">${escapeHtml(optionText(question, label))}</div>
            <div class="review-option-tags">${tags}</div>
          </li>
        `;
      }).join("");

      return `
        <article class="wrong-item">
          <div class="wrong-heading">
            <div class="meta">${question.year} 年｜第 ${question.questionNumber} 題</div>
            <span class="wrong-badge">答錯</span>
          </div>
          <h3>${escapeHtml(question.questionText)}</h3>
          <div class="answer-review">
            <p class="answer-line user-answer"><span>你的答案</span>${userText}</p>
            <p class="answer-line correct-answer"><span>官方正確解答</span><strong>${escapeHtml(question.correctAnswer)}</strong></p>
            <p class="answer-line accepted-answer"><span>可給分答案</span>${accepted}</p>
          </div>
          <div class="option-review-block">
            <h4>選項對照</h4>
            <ul class="option-review">${optionReview}</ul>
          </div>
          <p class="source">來源：${escapeHtml(question.sourceQuestionPdf)}；${escapeHtml(question.sourceAnswerPdf)}</p>
        </article>
      `;
    }).join("");
  }

  quizPanel.classList.add("hidden");
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadQuestions() {
  const payload = window.QUIZ_DATA;
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error("找不到內嵌題庫 questions-data.js");
  }
  state.questions = payload.questions;

  state.questions.forEach((question) => {
    if (!state.byYear.has(question.year)) {
      state.byYear.set(question.year, []);
    }
    state.byYear.get(question.year).push(question);
  });

  for (const questions of state.byYear.values()) {
    questions.sort((a, b) => a.questionNumber - b.questionNumber);
  }

  summary.textContent = `${state.byYear.size} 年份，${state.questions.length} 題`;
  renderYearButtons();
}

document.querySelector("#submit-button").addEventListener("click", renderResults);
document.querySelector("#back-button").addEventListener("click", () => {
  quizPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
});
document.querySelector("#retry-button").addEventListener("click", () => startQuiz(state.selectedYear));

try {
  loadQuestions();
} catch (error) {
  summary.textContent = "題庫載入失敗";
  yearButtons.innerHTML = `<p class="missing">${escapeHtml(error.message)}</p>`;
}
