const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middlewares
app.use(express.json());
app.use(express.static("public"));
app.use(cors());



// Serve HTML interface
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <title>AI PDF to CSV Agent</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/feather-icons/4.29.0/feather.min.js"></script>
    <style>
        .loader {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .fade-in {
            animation: fadeIn 0.5s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .chat-message {
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .drag-over {
            border-color: #3b82f6;
            background-color: #eff6ff;
        }
        .progress-bar {
            transition: width 0.3s ease;
        }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <i data-feather="cpu" class="h-8 w-8 text-blue-600"></i>
                    </div>
                    <div class="ml-3">
                        <h1 class="text-xl font-semibold text-gray-900">AI PDF to CSV Agent</h1>
                        <p class="text-sm text-gray-500">Intelligent document processing</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="bg-green-100 px-3 py-1 rounded-full">
                        <span class="text-sm text-green-800 font-medium">Ready</span>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left Panel - Upload & Settings -->
            <div class="lg:col-span-1">
                <!-- Upload Section -->
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                    <div class="flex items-center mb-4">
                        <i data-feather="upload" class="h-5 w-5 text-gray-600 mr-2"></i>
                        <h2 class="text-lg font-medium text-gray-900">Upload PDF</h2>
                    </div>
                    
                    <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer">
                        <i data-feather="file-plus" class="h-12 w-12 text-gray-400 mx-auto mb-4"></i>
                        <p class="text-gray-600 mb-2">Drop your PDF here or click to browse</p>
                        <p class="text-sm text-gray-500">Supports PDF files up to 10MB</p>
                        <input type="file" id="pdfFile" accept=".pdf" class="hidden">
                    </div>
                    
                    <div id="uploadProgress" class="hidden mt-4">
                        <div class="bg-gray-200 rounded-full h-2">
                            <div class="bg-blue-600 h-2 rounded-full progress-bar" style="width: 0%"></div>
                        </div>
                        <p class="text-sm text-gray-600 mt-2">Processing PDF...</p>
                    </div>
                    
                    <div id="uploadResult" class="mt-4"></div>
                </div>

                <!-- Format Selection -->
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center mb-4">
                        <i data-feather="settings" class="h-5 w-5 text-gray-600 mr-2"></i>
                        <h2 class="text-lg font-medium text-gray-900">Export Format</h2>
                    </div>
                    
                    <div class="space-y-4">
                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input type="radio" name="csvFormat" value="structured" checked class="mt-1">
                            <div>
                                <div class="font-medium text-gray-900">Structured Format</div>
                                <div class="text-sm text-gray-500">Readable format with headings and sub-sections</div>
                            </div>
                        </label>
                        <label class="flex items-start space-x-3 cursor-pointer">
    <input type="radio" name="csvFormat" value="excel" class="mt-1">
    <div>
        <div class="font-medium text-gray-900">Excel Format</div>
        <div class="text-sm text-gray-500">Download as .xlsx Excel file with formatting</div>
    </div>
</label>


                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input type="radio" name="csvFormat" value="traditional" class="mt-1">
                            <div>
                                <div class="font-medium text-gray-900">Traditional CSV</div>
                                <div class="text-sm text-gray-500">Standard flattened format for spreadsheets</div>
                            </div>
                        </label>
                    </div>
                    
                    <div class="flex space-x-2 mt-6">
                        <button onclick="previewCsv()" class="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors font-medium">
                            <i data-feather="eye" class="h-4 w-4 inline mr-2"></i>
                            Preview
                        </button>
                        <button onclick="downloadCsv()" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium">
                            <i data-feather="download" class="h-4 w-4 inline mr-2"></i>
                            Download
                        </button>
                    </div>
                    
                    <div id="downloadResult" class="mt-4"></div>
                </div>
            </div>
                
            <!-- Right Panel - Chat Interface -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
                    <!-- Chat Header -->
                    <div class="border-b border-gray-200 p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <i data-feather="message-circle" class="h-5 w-5 text-gray-600 mr-2"></i>
                                <h2 class="text-lg font-medium text-gray-900">AI Assistant</h2>
                            </div>
                            <button onclick="clearChat()" class="text-gray-500 hover:text-gray-700">
                                <i data-feather="trash-2" class="h-4 w-4"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Chat Messages -->
                    <div id="chatMessages" class="flex-1 p-6 overflow-y-auto space-y-4 max-h-96">
                        <div class="chat-message">
                            <div class="flex items-start space-x-3">
                                <div class="bg-blue-100 p-2 rounded-full">
                                    <i data-feather="cpu" class="h-4 w-4 text-blue-600"></i>
                                </div>
                                <div class="bg-gray-100 rounded-lg p-4 max-w-md">
                                    <p class="text-gray-800">Hello! I'm your AI assistant. Upload a PDF to get started, then I can help you process and manipulate the data.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Chat Input -->
                    <div class="border-t border-gray-200 p-6">
                        <div class="flex space-x-4">
                            <div class="flex-1 relative">
                                <textarea 
                                    id="chatInput" 
                                    placeholder="Type your command here... (e.g., 'Create CSV from uploaded PDF', 'Add new column', 'Filter data')"
                                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                    rows="3"
                                    onkeydown="handleKeyDown(event)"
                                ></textarea>
                                <div class="absolute bottom-3 right-3 text-xs text-gray-500">
                                    Press Ctrl+Enter to send
                                </div>
                            </div>
                            <button 
                                onclick="sendMessage()" 
                                class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium self-end"
                                id="sendButton"
                            >
                                <i data-feather="send" class="h-4 w-4"></i>
                            </button>
                        </div>
                        
                        <!-- Quick Actions -->
                        <div class="mt-4 flex flex-wrap gap-2">
                            <button onclick="quickCommand('Create CSV file from uploaded PDF')" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Create CSV
                            </button>
                            <button onclick="quickCommand('Add new column')" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Add Column
                            </button>
                            <button onclick="quickCommand('Sort data alphabetically')" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Sort Data
                            </button>
                            <button onclick="quickCommand('Filter data')" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Filter Data
                            </button>
                            <button onclick="quickCommand('Format Excel with bold headers')" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Format Excel
                            </button>
                            <button onclick="quickCommand(`bold column 'name'`)" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Bold Name Column
                            </button>
                            <button onclick="quickCommand(`bold 'John Doe' in column 'name'`)" class="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200 transition-colors">
                                Bold John Doe
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentData = [];
        let isProcessing = false;
        
        // Initialize Feather icons
        feather.replace();
        
        // File upload handling
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdfFile');
        
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                uploadPdf();
            }
        });
        
        fileInput.addEventListener('change', uploadPdf);
        
        function showLoader(element) {
            element.innerHTML = '<div class="flex items-center justify-center"><div class="loader"></div><span class="ml-2 text-gray-600">Processing...</span></div>';
        }
        
        function showSuccess(element, message) {
            element.innerHTML = \`<div class="bg-green-50 border border-green-200 rounded-md p-4 fade-in">
                <div class="flex items-center">
                    <i data-feather="check-circle" class="h-5 w-5 text-green-600 mr-2"></i>
                    <span class="text-green-800">\${message}</span>
                </div>
            </div>\`;
            feather.replace();
        }
        
        function showError(element, message) {
            element.innerHTML = \`<div class="bg-red-50 border border-red-200 rounded-md p-4 fade-in">
                <div class="flex items-center">
                    <i data-feather="alert-circle" class="h-5 w-5 text-red-600 mr-2"></i>
                    <span class="text-red-800">\${message}</span>
                </div>
            </div>\`;
            feather.replace();
        }
        
        function updateProgress(percentage) {
            const progressBar = document.querySelector('.progress-bar');
            progressBar.style.width = percentage + '%';
        }
        
        async function uploadPdf() {
            const file = fileInput.files[0];
            
            if (!file) {
                showError(document.getElementById('uploadResult'), 'Please select a PDF file');
                return;
            }
            
            if (file.type !== 'application/pdf') {
                showError(document.getElementById('uploadResult'), 'Please select a valid PDF file');
                return;
            }
            
            const formData = new FormData();
            formData.append('pdf', file);
            
            const progressDiv = document.getElementById('uploadProgress');
            const resultDiv = document.getElementById('uploadResult');
            
            progressDiv.classList.remove('hidden');
            updateProgress(0);
            
            try {
                updateProgress(30);
                
                const response = await fetch('/upload-pdf', {
                    method: 'POST',
                    body: formData
                });
                
                updateProgress(70);
                
                const result = await response.json();
                
                updateProgress(100);
                
                setTimeout(() => {
                    progressDiv.classList.add('hidden');
                    
                    if (result.success) {
                        showSuccess(resultDiv, 'PDF processed successfully! Ready for CSV creation.');
                        addAssistantMessage('PDF uploaded and processed successfully! You can now create a CSV file or ask me to manipulate the data.');
                    } else {
                        showError(resultDiv, result.error);
                    }
                }, 500);
                
            } catch (error) {
                progressDiv.classList.add('hidden');
                showError(resultDiv, 'Upload failed: ' + error.message);
            }
        }
        
        function addUserMessage(message) {
            const chatMessages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = \`
                <div class="flex items-start space-x-3 justify-end">
                    <div class="bg-blue-600 text-white rounded-lg p-4 max-w-md">
                        <p>\${message}</p>
                    </div>
                    <div class="bg-blue-600 p-2 rounded-full">
                        <i data-feather="user" class="h-4 w-4 text-white"></i>
                    </div>
                </div>
           \`;
            chatMessages.appendChild(messageDiv);
            feather.replace();
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function addAssistantMessage(message, isError = false) {
            const chatMessages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            
            const bgColor = isError ? 'bg-red-100' : 'bg-gray-100';
            const iconColor = isError ? 'text-red-600' : 'text-blue-600';
            const textColor = isError ? 'text-red-800' : 'text-gray-800';
            
            messageDiv.innerHTML = \`
                <div class="flex items-start space-x-3">
                    <div class="\${isError ? 'bg-red-100' : 'bg-blue-100'} p-2 rounded-full">
                        <i data-feather="\${isError ? 'alert-circle' : 'cpu'}" class="h-4 w-4 \${iconColor}"></i>
                    </div>
                    <div class="\${bgColor} rounded-lg p-4 max-w-md">
                        <p class="\${textColor}">\${message}</p>
                    </div>
                </div>
           \`;
            chatMessages.appendChild(messageDiv);
            feather.replace();
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function addLoadingMessage() {
            const chatMessages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.id = 'loadingMessage';
            messageDiv.innerHTML = \`
                <div class="flex items-start space-x-3">
                    <div class="bg-blue-100 p-2 rounded-full">
                        <div class="loader w-4 h-4"></div>
                    </div>
                    <div class="bg-gray-100 rounded-lg p-4 max-w-md">
                        <p class="text-gray-800">Processing your request...</p>
                    </div>
                </div>
            \`;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function removeLoadingMessage() {
            const loadingMessage = document.getElementById('loadingMessage');
            if (loadingMessage) {
                loadingMessage.remove();
            }
        }
        
        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message || isProcessing) return;
            
            isProcessing = true;
            const sendButton = document.getElementById('sendButton');
            sendButton.disabled = true;
            sendButton.innerHTML = '<div class="loader w-4 h-4"></div>';
            
            addUserMessage(message);
            input.value = '';
            
            addLoadingMessage();
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ command: message })
                });
                
                const result = await response.json();
                
                removeLoadingMessage();
                
                if (result.success) {
                    currentData = result.data;
                    addAssistantMessage(result.message);
                    
                    if (result.data && result.data.length > 0) {
                        const preview = JSON.stringify(result.data.slice(0, 2), null, 2);
                        const previewMessage = \`Data preview (first 2 rows):\\n\\n\${preview}\${result.data.length > 2 ? '\\n\\n... and ' + (result.data.length - 2) + ' more rows' : ''}\`;
                        addAssistantMessage(previewMessage);
                    }
                } else {
                    addAssistantMessage(result.error, true);
                }
            } catch (error) {
                removeLoadingMessage();
                addAssistantMessage('Error: ' + error.message, true);
            } finally {
                isProcessing = false;
                sendButton.disabled = false;
                sendButton.innerHTML = '<i data-feather="send" class="h-4 w-4"></i>';
                feather.replace();
            }
        }
        
        function quickCommand(command) {
            document.getElementById('chatInput').value = command;
            sendMessage();
        }
        
        function handleKeyDown(event) {
            if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        }
        
        function getSelectedFormat() {
            const radios = document.getElementsByName('csvFormat');
            for (let radio of radios) {
                if (radio.checked) {
                    return radio.value;
                }
            }
            return 'structured';
        }
        
        async function previewCsv() {
            const format = getSelectedFormat();
            const resultDiv = document.getElementById('downloadResult');
            
            showLoader(resultDiv);
            
            try {
                const response = await fetch('/preview-csv?format=' + format);
                const result = await response.json();
                
                if (result.success) {
                    resultDiv.innerHTML = \`
                        <div class="bg-blue-50 border border-blue-200 rounded-md p-4 fade-in">
                            <div class="flex items-center mb-2">
                                <i data-feather="eye" class="h-5 w-5 text-blue-600 mr-2"></i>
                                <span class="text-blue-800 font-medium">Preview of \${format} format</span>
                            </div>
                            <pre class="bg-white p-3 rounded border text-sm text-gray-800 overflow-x-auto max-h-40">\${result.preview}</pre>
                        </div>
                    \`;
                } else {
                    showError(resultDiv, result.error);
                }
            } catch (error) {
                showError(resultDiv, 'Preview failed: ' + error.message);
            }
            
            feather.replace();
        }
        
        async function downloadCsv() {
    const format = getSelectedFormat();
    const resultDiv = document.getElementById('downloadResult');

    showLoader(resultDiv);

    try {
        const response = await fetch('/download-csv?format=' + format);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Set file extension based on format
            const extension = format === 'structured' ? 'csv' : 'xlsx';
            const fileName = 'processed_data.' + extension;

            const a = document.createElement('a');
            a.href = url;
           a.download = format === "excel" ? "processed_data.xlsx" : "processed_data.csv";
            a.click();
            window.URL.revokeObjectURL(url);

            showSuccess(resultDiv, 'File downloaded successfully as ' + fileName + '!');
        } else {
            const result = await response.json();
            showError(resultDiv, result.error);
        }
    } catch (error) {
        showError(resultDiv, 'Download failed: ' + error.message);
    }
}

        
        function clearChat() {
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = \`
                <div class="chat-message">
                    <div class="flex items-start space-x-3">
                        <div class="bg-blue-100 p-2 rounded-full">
                            <i data-feather="cpu" class="h-4 w-4 text-blue-600"></i>
                        </div>
                        <div class="bg-gray-100 rounded-lg p-4 max-w-md">
                            <p class="text-gray-800">Chat cleared! I'm ready to help you process your PDF data.</p>
                        </div>
                    </div>
                </div>
            \`;
            feather.replace();
        }
        
        // Auto-resize textarea
        document.getElementById('chatInput').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    </script>
</body>
</html>`);
});
// Routes
app.use("/", require("./routes/pdfRoutes"));
app.use("/", require("./routes/chatRoutes"));
app.use("/", require("./routes/csvRoutes"));

// Ensure directories exist
["./uploads", "./exports"].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

app.listen(PORT, () => {
  console.log(`🚀 AI Agent server running on http://localhost:${PORT}`);
});
