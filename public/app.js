/**
 * Client-Side Application JS — SheetSage AI
 * ----------------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Persistent Browser Sessions: We retrieve or generate a unique UUID and store it in `localStorage`.
 *    This ID is sent in the `x-session-id` header for all requests, linking the client to their private SQLite database.
 * 2. AJAX Upload Progress: Instead of basic `fetch`, we use `XMLHttpRequest` which provides a progress listener
 *    (`.upload.onprogress`). This lets us calculate exactly how many bytes have been sent to show a real-time progress bar.
 * 3. Canvas & Chart.js Lifecycle: Chart.js binds an interactive object to a canvas. If you try to draw a new chart
 *    on an active canvas without calling `.destroy()`, the old chart will glitch on mouseover. We track `activeChartInstance`.
 * 4. DOM Injection: Safely creating elements dynamically and setting inner HTML (with markdown parsing)
 *    to display data profiles, KPI cards, and custom preview tables.
 */

// Initialize or retrieve Session ID
let sessionId = localStorage.getItem("sheetsage_session_id");
if (!sessionId) {
  sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
  localStorage.setItem("sheetsage_session_id", sessionId);
}

// State Registry
let activeDatasetId = null;
let activeChartInstance = null;
let currentQueryData = null; // Store query results for view toggling
let currentQueryPlan = null;
let activeColumnsProfile = null; // Keep list of columns profile mapping
let currentViewMode = "chart"; // "chart" | "table"

// DOM Elements Mapping
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadScreen = document.getElementById("uploadScreen");
const uploadProgressContainer = document.getElementById("uploadProgressContainer");
const progressStatus = document.getElementById("progressStatus");
const progressPercent = document.getElementById("progressPercent");
const progressBar = document.getElementById("progressBar");
const uploadError = document.getElementById("uploadError");
const uploadErrorText = document.getElementById("uploadErrorText");

const activeFileContainer = document.getElementById("activeFileContainer");
const activeFileName = document.getElementById("activeFileName");
const activeFileSize = document.getElementById("activeFileSize");
const resetSessionBtn = document.getElementById("resetSessionBtn");
const statusPing = document.getElementById("statusPing");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const statRows = document.getElementById("statRows");
const statCols = document.getElementById("statCols");
const columnsList = document.getElementById("columnsList");
const suggestAggBtn = document.getElementById("suggestAggBtn");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

const workspaceWorkspace = document.getElementById("workspaceWorkspace");
const workspaceTitle = document.getElementById("workspaceTitle");
const toggleViewModeBtn = document.getElementById("toggleViewModeBtn");
const downloadQueryExcelBtn = document.getElementById("downloadQueryExcelBtn");
const chartViewContainer = document.getElementById("chartViewContainer");
const tableViewContainer = document.getElementById("tableViewContainer");
const kpiViewContainer = document.getElementById("kpiViewContainer");
const tableHeaderRow = document.getElementById("tableHeaderRow");
const tableBodyRows = document.getElementById("tableBodyRows");

// ─── Drag & Drop Event Listeners ───
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("border-indigo-500/50", "bg-slate-900/60");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("border-indigo-500/50", "bg-slate-900/60");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("border-indigo-500/50", "bg-slate-900/60");
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    handleFileUpload(files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileUpload(e.target.files[0]);
  }
});

// ─── File Upload Handler (AJAX Progress) ───
function handleFileUpload(file) {
  const validExtensions = [".csv", ".xlsx", ".xls", ".pdf"];
  const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

  if (!validExtensions.includes(fileExt)) {
    showUploadError(`Invalid extension '${fileExt}'. Only PDF, XLSX, XLS, and CSV files are supported.`);
    return;
  }

  const maxFileSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxFileSize) {
    showUploadError("File exceeds the 100MB size limit.");
    return;
  }

  // Update Progress UI
  uploadError.classList.add("hidden");
  uploadProgressContainer.classList.remove("hidden");
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressStatus.textContent = "Uploading document...";

  updateServerStatus("Processing", "yellow");

  // Create AJAX Form Data
  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/datasets/upload", true);
  
  // Custom headers to identify session
  xhr.setRequestHeader("x-session-id", sessionId);

  // Track upload percentage
  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = percent + "%";
      progressPercent.textContent = percent + "%";
      if (percent === 100) {
        progressStatus.textContent = "Parsing columns and profiling rows...";
      }
    }
  });

  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            onDatasetIngested(response);
          } else {
            showUploadError(response.error || "Failed to process file.");
          }
        } catch (err) {
          showUploadError("Server returned a malformed response.");
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          showUploadError(response.error || "File upload failed.");
        } catch (_) {
          showUploadError("Server connection error: Code " + xhr.status);
        }
      }
    }
  };

  xhr.send(formData);
}

function showUploadError(message) {
  uploadErrorText.textContent = message;
  uploadError.classList.remove("hidden");
  uploadProgressContainer.classList.add("hidden");
  updateServerStatus("Ready", "emerald");
}

// ─── Actions following successful ingestion ───
function onDatasetIngested(data) {
  activeDatasetId = data.datasetId;
  activeColumnsProfile = data.profile.profiles;

  // Render metadata values
  activeFileName.textContent = data.filename;
  const sizeMB = (data.size / (1024 * 1024)).toFixed(2);
  activeFileSize.textContent = `${sizeMB} MB`;

  statRows.textContent = data.rowCount.toLocaleString();
  statCols.textContent = data.columnsCount.toLocaleString();

  // Hide upload panel
  uploadScreen.classList.add("opacity-0", "pointer-events-none");
  setTimeout(() => uploadScreen.classList.add("hidden"), 500);

  // Show action badges
  activeFileContainer.classList.remove("hidden");
  resetSessionBtn.classList.remove("hidden");
  updateServerStatus("Ready", "emerald");

  // Render Sidebar Schema Columns
  renderColumnsList(data.profile);

  // Append welcome message inside chat logs
  appendChatMessage(
    "assistant",
    `🚀 **"${data.filename}" Loaded successfully!**\n\nI processed **${data.rowCount.toLocaleString()} records** and detected **${data.columnsCount} columns**.\n\nYou can inspect the schema column details in the sidebar to review missing values, data distributions, and statistics. Ask a question below to analyze your data!`
  );

  // Update suggestions agg chip if numeric column exists
  const numCol = Object.keys(activeColumnsProfile).find(c => activeColumnsProfile[c].type === "numeric");
  const catCol = Object.keys(activeColumnsProfile).find(c => activeColumnsProfile[c].type === "text" && activeColumnsProfile[c].isCategorical);
  if (numCol && catCol) {
    suggestAggBtn.textContent = `Chart average ${numCol} by ${catCol}`;
    suggestAggBtn.onclick = () => sendQuickPrompt(`Chart the average ${numCol} grouped by ${catCol}`);
    suggestAggBtn.classList.remove("hidden");
  } else {
    suggestAggBtn.classList.add("hidden");
  }
}

// ─── Render list of schema columns in sidebar ───
function renderColumnsList(profile) {
  columnsList.innerHTML = "";
  const cols = profile.columns;
  const colDetails = profile.profiles;

  cols.forEach((col) => {
    const detail = colDetails[col];
    const item = document.createElement("div");
    item.className = "bg-slate-900 border border-slate-850 p-2.5 rounded-lg flex flex-col space-y-1 hover:border-slate-800 transition duration-300";

    // Determine type indicator symbol
    let typeSymbol = "T";
    let typeClass = "datatype-text";
    if (detail.type === "numeric") {
      typeSymbol = "#";
      typeClass = "datatype-numeric";
    } else if (detail.type === "date") {
      typeSymbol = "D";
      typeClass = "datatype-date";
    }

    item.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2 truncate">
          <span class="w-4 h-4 rounded text-xxs font-extrabold flex items-center justify-center shrink-0 ${typeClass}">${typeSymbol}</span>
          <span class="text-xs font-semibold text-slate-300 truncate" title="${col}">${col}</span>
        </div>
        ${detail.type === 'numeric' ? `
          <button onclick="quickFieldQuery('sum', '${col}')" class="text-xxs text-indigo-400 hover:text-indigo-300 px-1 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 rounded" title="Get Total Sum">Sum</button>
        ` : ''}
      </div>
      <div class="flex justify-between text-xxs text-slate-500">
        <span>Missing: ${detail.nullPercentage}%</span>
        <span>Distinct: ${detail.distinctCount}</span>
      </div>
      ${detail.type === 'numeric' && detail.mean !== null ? `
        <div class="text-xxxs font-mono text-slate-600 flex justify-between border-t border-slate-850/50 pt-1">
          <span>Min: ${detail.min}</span>
          <span>Max: ${detail.max}</span>
        </div>
      ` : ''}
    `;

    columnsList.appendChild(item);
  });
}

// ─── Chat Message Interactions ───
function handleTextareaKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    if (event.ctrlKey) {
      event.preventDefault();
      sendChatMessage();
    }
  }
}

function sendQuickPrompt(promptText) {
  chatInput.value = promptText;
  sendChatMessage();
}

function quickFieldQuery(agg, col) {
  sendQuickPrompt(`What is the ${agg} of column ${col}?`);
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  chatInput.style.height = "auto";

  // Append user bubble
  appendChatMessage("user", text);

  // Append loader bubble
  const loaderId = appendChatLoader();

  updateServerStatus("Thinking", "purple");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId
      },
      body: JSON.stringify({ command: text })
    });

    const data = await response.json();
    removeChatLoader(loaderId);
    updateServerStatus("Ready", "emerald");

    if (data.success) {
      // Append assistant answer (rendered using markdown parser)
      appendChatMessage("assistant", data.message);

      // Handle query results output
      if (data.chart && data.chart.type !== "empty" && data.chart.type !== "conversational") {
        renderWorkspaceResult(data);
      } else {
        // Hide result workspace panel if query is purely conversational
        workspaceWorkspace.classList.add("hidden");
      }
    } else {
      appendChatMessage("assistant", `⚠️ **Analytics Calculation Error**\n\n${data.error}`, true);
      workspaceWorkspace.classList.add("hidden");
    }

  } catch (error) {
    removeChatLoader(loaderId);
    updateServerStatus("Ready", "emerald");
    appendChatMessage("assistant", `❌ **Network Connection Error**\n\nFailed to send message: ${error.message}`, true);
  }
}

// Append bubble template to scroll panel
function appendChatMessage(role, content, isError = false) {
  const messageItem = document.createElement("div");
  messageItem.className = "flex items-start space-x-3.5 max-w-2xl chat-message-item";
  
  const isUser = role === "user";
  
  if (isUser) {
    messageItem.className += " ml-auto justify-end";
  }

  // Parse assistant response markdown safely
  const parsedBody = isUser ? `<p>${escapeHTML(content)}</p>` : marked.parse(content);
  
  const icon = isUser 
    ? `<i data-feather="user" class="w-4 h-4"></i>`
    : `<i data-feather="${isError ? 'alert-circle' : 'cpu'}" class="w-4 h-4"></i>`;

  const themeClass = isUser 
    ? "bg-indigo-600 border border-indigo-500 text-white rounded-tr-none shadow-md"
    : isError 
      ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-none shadow-sm"
      : "bg-slate-950 border border-slate-850 text-slate-300 rounded-tl-none shadow-sm";

  const authorLabel = isUser ? "You" : "SheetSage AI";
  const labelColor = isUser ? "text-slate-400 text-right w-full block" : "text-indigo-400";

  messageItem.innerHTML = isUser ? `
    <div class="space-y-1">
      <p class="text-xxs font-bold uppercase tracking-wider ${labelColor}">${authorLabel}</p>
      <div class="${themeClass} p-3.5 rounded-2xl text-sm leading-relaxed max-w-lg">
        ${parsedBody}
      </div>
    </div>
    <div class="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-sm mt-0.5">
      ${icon}
    </div>
  ` : `
    <div class="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-sm mt-0.5">
      ${icon}
    </div>
    <div class="space-y-1">
      <p class="text-xxs font-bold uppercase tracking-wider ${labelColor}">${authorLabel}</p>
      <div class="prose ${themeClass} p-4 rounded-2xl text-sm leading-relaxed max-w-lg">
        ${parsedBody}
      </div>
    </div>
  `;

  chatMessages.appendChild(messageItem);
  feather.replace();
  scrollToBottom(chatMessages);
}

function appendChatLoader() {
  const loaderId = "loader_" + Date.now();
  const loaderBubble = document.createElement("div");
  loaderBubble.id = loaderId;
  loaderBubble.className = "flex items-start space-x-3.5 max-w-2xl chat-message-item";
  
  loaderBubble.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
      <div class="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div class="space-y-1">
      <p class="text-xxs font-bold uppercase tracking-wider text-slate-500">SheetSage AI</p>
      <div class="bg-slate-950/60 border border-slate-850/60 p-3.5 rounded-2xl rounded-tl-none text-xs text-slate-500 leading-relaxed italic flex items-center space-x-2">
        <span>AI is checking schema statistics and querying database...</span>
      </div>
    </div>
  `;
  chatMessages.appendChild(loaderBubble);
  scrollToBottom(chatMessages);
  return loaderId;
}

function removeChatLoader(id) {
  const loader = document.getElementById(id);
  if (loader) loader.remove();
}

// ─── Result Panel Workspace Visualizer ───
function renderWorkspaceResult(data) {
  currentQueryData = data.dataPreview;
  currentQueryPlan = data.queryPlan;
  currentViewMode = "chart";

  const chartInfo = data.chart;
  workspaceTitle.textContent = chartInfo.title || "Query Outputs";
  workspaceWorkspace.classList.remove("hidden");

  // Show correct button text
  toggleViewModeBtn.textContent = "Switch to Table";
  toggleViewModeBtn.classList.remove("hidden");

  // Toggle visible container panels based on spec type
  if (chartInfo.type === "table") {
    // Select has no visual configuration: only table rows
    toggleViewModeBtn.classList.add("hidden"); // Can't switch
    renderWorkspaceTable(currentQueryData);
  } else if (chartInfo.type === "kpi") {
    renderWorkspaceKPI(chartInfo.kpiLabel, chartInfo.kpiValue);
  } else {
    renderWorkspaceChart(chartInfo);
  }
}

function renderWorkspaceChart(chartSpec) {
  chartViewContainer.classList.remove("hidden");
  tableViewContainer.classList.add("hidden");
  kpiViewContainer.classList.add("hidden");

  // Destroy previous Chart instance to prevent canvas glitches
  if (activeChartInstance) {
    activeChartInstance.destroy();
  }

  const ctx = document.getElementById("workspaceChart").getContext("2d");
  
  // Custom dark theme chart configuration mapping
  activeChartInstance = new Chart(ctx, {
    type: chartSpec.type,
    data: {
      labels: chartSpec.labels,
      datasets: chartSpec.datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: chartSpec.type === "doughnut" || chartSpec.type === "pie",
          position: "right",
          labels: { color: "#94a3b8", font: { size: 10, family: 'Plus Jakarta Sans' }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: "#020617",
          titleColor: "#f1f5f9",
          bodyColor: "#cbd5e1",
          borderColor: "#334155",
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6
        }
      },
      scales: (chartSpec.type === "bar" || chartSpec.type === "line") ? {
        x: {
          grid: { color: "rgba(30, 41, 59, 0.4)", drawBorder: false },
          ticks: { color: "#64748b", font: { size: 9, family: 'Plus Jakarta Sans' } }
        },
        y: {
          grid: { color: "rgba(30, 41, 59, 0.4)", drawBorder: false },
          ticks: { color: "#64748b", font: { size: 9, family: 'Plus Jakarta Sans' } }
        }
      } : {}
    }
  });
}

function renderWorkspaceTable(rows) {
  chartViewContainer.classList.add("hidden");
  tableViewContainer.classList.remove("hidden");
  kpiViewContainer.classList.add("hidden");

  if (!rows || rows.length === 0) {
    tableHeaderRow.innerHTML = "<th>No data preview available</th>";
    tableBodyRows.innerHTML = "";
    return;
  }

  // Populate headers
  const cols = Object.keys(rows[0]);
  tableHeaderRow.innerHTML = cols.map(c => `<th>${c}</th>`).join("");

  // Populate row previews (limit to first 10 for workspace view height constraints)
  const rowsToShow = rows.slice(0, 10);
  tableBodyRows.innerHTML = rowsToShow.map((row) => {
    return `<tr>${cols.map(c => {
      let val = row[c];
      if (val === undefined || val === null) val = "";
      return `<td title="${escapeHTML(String(val))}">${escapeHTML(String(val))}</td>`;
    }).join("")}</tr>`;
  }).join("");
}

function renderWorkspaceKPI(label, value) {
  chartViewContainer.classList.add("hidden");
  tableViewContainer.classList.add("hidden");
  kpiViewContainer.classList.remove("hidden");

  document.getElementById("kpiLabel").textContent = label;
  
  // Format numeric values elegantly
  let displayVal = value;
  if (typeof value === "number") {
    displayVal = value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  document.getElementById("kpiValue").textContent = displayVal;
}

// ─── Toggles & Exports ───
toggleViewModeBtn.addEventListener("click", () => {
  if (currentViewMode === "chart") {
    currentViewMode = "table";
    toggleViewModeBtn.textContent = "Switch to Chart";
    renderWorkspaceTable(currentQueryData);
  } else {
    currentViewMode = "chart";
    toggleViewModeBtn.textContent = "Switch to Table";
    
    const chartInfo = activeChartInstance?.config?.data;
    if (chartInfo) {
      chartViewContainer.classList.remove("hidden");
      tableViewContainer.classList.add("hidden");
      kpiViewContainer.classList.add("hidden");
    }
  }
});

// Trigger dynamic download of selection dataset
downloadQueryExcelBtn.addEventListener("click", () => {
  if (!activeDatasetId) return;
  // Trigger a full download stream of active session dataset
  window.open(`/api/datasets/export?format=excel`, "_blank");
});

// ─── Active session reset ───
resetSessionBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete this dataset? This will clear all calculations and active chat history.")) return;
  
  updateServerStatus("Resetting", "red");

  try {
    // Delete database file
    await fetch(`/api/chat/clear`, {
      method: "POST",
      headers: { "x-session-id": sessionId }
    });

    // Reset local state variables
    activeDatasetId = null;
    currentQueryData = null;
    currentQueryPlan = null;
    activeColumnsProfile = null;

    if (activeChartInstance) {
      activeChartInstance.destroy();
      activeChartInstance = null;
    }

    // Reset layout visibility
    activeFileContainer.classList.add("hidden");
    resetSessionBtn.classList.add("hidden");
    workspaceWorkspace.classList.add("hidden");
    columnsList.innerHTML = `<div class="text-xs text-slate-500 italic py-2">No dataset loaded.</div>`;
    statRows.textContent = "—";
    statCols.textContent = "—";
    
    // Clear chat log
    chatMessages.innerHTML = `
      <div class="flex items-start space-x-3.5 max-w-2xl chat-message-item">
        <div class="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-sm mt-0.5">
          <i data-feather="cpu" class="w-4 h-4"></i>
        </div>
        <div class="space-y-1">
          <p class="text-xxs font-bold uppercase tracking-wider text-indigo-400">SheetSage AI</p>
          <div class="bg-slate-950 border border-slate-850 p-4 rounded-2xl rounded-tl-none text-sm text-slate-300 leading-relaxed shadow-sm">
            <p>Session and data contexts have been cleared. Drop a spreadsheet or PDF above to start a new analysis!</p>
          </div>
        </div>
      </div>
    `;
    feather.replace();

    // Show upload overlay
    uploadScreen.classList.remove("hidden");
    setTimeout(() => uploadScreen.classList.remove("opacity-0", "pointer-events-none"), 50);

  } catch (err) {
    console.error("Failed to reset session:", err.message);
  }
  
  updateServerStatus("Ready", "emerald");
});

// ─── UI Helper Utilities ───
function updateServerStatus(status, color) {
  statusText.textContent = status;
  statusDot.className = `relative inline-flex rounded-full h-2 w-2 bg-${color}-500`;
  statusPing.className = `animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-75`;
  if (color === "emerald") {
    statusPing.classList.remove("animate-ping"); // Stop pinging when idle
  }
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Adjust prompt input box height dynamically
chatInput.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});
