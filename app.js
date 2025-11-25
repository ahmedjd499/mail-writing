// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const jobPostInput = document.getElementById('jobPost');
const additionalInfoInput = document.getElementById('additionalInfo');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const jobInfoSection = document.getElementById('jobInfoSection');
const jobInfo = document.getElementById('jobInfo');
const emailSection = document.getElementById('emailSection');
const emailSubject = document.getElementById('emailSubject');
const emailBody = document.getElementById('emailBody');
const loadingState = document.getElementById('loadingState');
const placeholder = document.getElementById('placeholder');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Modal elements
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// New elements for screenshot and CV
const screenshotInput = document.getElementById('screenshotInput');
const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const dropZone = document.getElementById('dropZone');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImage = document.getElementById('removeImage');
const cvInput = document.getElementById('cvInput');
const cvStatus = document.getElementById('cvStatus');
const cvFileName = document.getElementById('cvFileName');

// Email sending elements
const openMailtoBtn = document.getElementById('openMailtoBtn');
const toEmail = document.getElementById('toEmail');

// State
let uploadedScreenshot = null;
let uploadedCV = null;
let cvText = '';
let cvFileData = null; // Store file data for attachment

// Load saved data from localStorage
window.addEventListener('DOMContentLoaded', () => {
    const savedApiKey = localStorage.getItem('groqApiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }

    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        modelSelect.value = savedModel;
    }

    // Load saved CV if exists
    const savedCVName = localStorage.getItem('cvFileName');
    const savedCVText = localStorage.getItem('cvText');
    if (savedCVName && savedCVText) {
        cvText = savedCVText;
        cvFileName.textContent = savedCVName;
        cvStatus.classList.remove('hidden');
    }
});

// Register service worker and listen for Web Share Target messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service Worker registered:', reg))
        .catch(err => console.warn('Service Worker registration failed:', err));

    if (typeof navigator.serviceWorker.startMessages === 'function') {
        navigator.serviceWorker.startMessages();
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.type !== 'share-target') return;

        // If the share included text, populate the job post input
        if (data.text && jobPostInput) {
            jobPostInput.value = data.text;
            showToast('Shared text received', 'info');
        }

        const firstFile = data.files && data.files.length ? data.files[0] : null;
        const firstSerialized = data.serializedFiles && data.serializedFiles.length ? data.serializedFiles[0] : null;

        // Prefer handling actual File/Blob objects when available
        if (firstFile && isBlobLike(firstFile) && typeof handleScreenshotUpload === 'function') {
            handleScreenshotUpload(firstFile);
            showToast('Shared image received', 'success');
            return;
        }

        // Fallback to serialized data URLs from the service worker
        if (firstSerialized && firstSerialized.dataUrl) {
            handleSharedImageData(firstSerialized);
        }
    });
}

// Handle LaunchQueue shares when app is opened from Android share sheet
if ('launchQueue' in window && typeof window.launchQueue.setConsumer === 'function') {
    window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams) return;

        const { files = [], title, text } = launchParams;

        if (text && jobPostInput) {
            jobPostInput.value = text;
            showToast('Shared text received', 'info');
        }

        if (files.length && typeof handleScreenshotUpload === 'function') {
            for (const fileHandle of files) {
                try {
                    const file = await fileHandle.getFile();
                    if (file && file.type && file.type.startsWith('image/')) {
                        await handleScreenshotUpload(file);
                        showToast('Shared image received', 'success');
                        break;
                    }
                } catch (error) {
                    console.error('Failed to read shared file from launchQueue:', error);
                }
            }
        }
    });
}

// Save model selection
modelSelect.addEventListener('change', () => {
    localStorage.setItem('selectedModel', modelSelect.value);
});

// Save API key to localStorage when changed
apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('groqApiKey', apiKeyInput.value);
});

// Modal handlers
openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
});

saveSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    showToast('Settings saved successfully!', 'success');
});

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
});

// Screenshot Upload Handling
// Desktop: Drag & Drop Zone
if (dropZone) {
    dropZone.addEventListener('click', (e) => {
        screenshotInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleScreenshotUpload(file);
        }
    });
}

// Mobile: Separate buttons for camera and gallery
if (takePhotoBtn) {
    takePhotoBtn.addEventListener('click', () => {
        cameraInput.click();
    });
}

if (chooseFileBtn) {
    chooseFileBtn.addEventListener('click', () => {
        galleryInput.click();
    });
}

// Handle all file inputs
[screenshotInput, cameraInput, galleryInput].forEach(input => {
    if (input) {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleScreenshotUpload(file);
            }
        });
    }
});

removeImage.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadedScreenshot = null;
    if (screenshotInput) screenshotInput.value = '';
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
    imagePreview.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
});

// Clipboard Paste Handling for Images (Desktop only)
if (!isMobileDevice()) {
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Check if the item is an image
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    handleScreenshotUpload(file);
                    showToast('Image pasted from clipboard!', 'success');
                }
                break;
            }
        }
    });

    // Visual feedback for paste availability (Desktop only)
    window.addEventListener('focus', () => {
        dropZone.setAttribute('title', 'Press Ctrl+V to paste an image from clipboard');
    });
}

// Helper function to detect mobile devices
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

function isBlobLike(value) {
    return value && typeof value === 'object' && typeof value.arrayBuffer === 'function';
}

async function handleScreenshotUpload(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('Image size must be less than 10MB', 'error');
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedScreenshot = e.target.result;
            previewImg.src = e.target.result;
            imagePreview.classList.remove('hidden');
            if (dropZone) dropZone.classList.add('hidden');
            showToast('Screenshot uploaded successfully', 'success');
        };
        reader.onerror = () => {
            showToast('Failed to read image file', 'error');
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error uploading screenshot:', error);
        showToast('Failed to upload screenshot', 'error');
    }
}

function handleSharedImageData(sharedFile) {
    const { dataUrl, name } = sharedFile;
    if (!dataUrl) {
        showToast('Shared image data missing', 'error');
        return;
    }

    uploadedScreenshot = dataUrl;
    if (previewImg) {
        previewImg.src = dataUrl;
    }
    if (imagePreview) {
        imagePreview.classList.remove('hidden');
    }
    if (dropZone) {
        dropZone.classList.add('hidden');
    }

    showToast(`Shared image received${name ? ` (${name})` : ''}`, 'success');
}

// CV Upload Handling
cvInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        uploadedCV = file;
        cvFileName.textContent = file.name;
        cvStatus.classList.remove('hidden');

        // Store file for attachment
        const attachReader = new FileReader();
        attachReader.onload = (event) => {
            cvFileData = {
                name: file.name,
                data: event.target.result,
                type: file.type
            };
        };
        attachReader.readAsDataURL(file);

        // Read CV content for text extraction
        if (file.type === 'text/plain') {
            const textReader = new FileReader();
            textReader.onload = async (event) => {
                cvText = event.target.result;
                // Save to localStorage
                localStorage.setItem('cvFileName', file.name);
                localStorage.setItem('cvText', cvText);
                showToast('CV uploaded and content extracted successfully', 'success');
            };
            textReader.readAsText(file);
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            // For PDF files, extract text using PDF.js
            showToast('Extracting text from PDF...', 'info');
            const pdfReader = new FileReader();
            pdfReader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target.result;

                    // Load PDF.js library if not already loaded
                    if (typeof pdfjsLib === 'undefined') {
                        await loadPDFJSLibrary();
                    }

                    // Extract text from PDF
                    const extractedText = await extractTextFromPDF(arrayBuffer);

                    if (extractedText && extractedText.trim().length > 0) {
                        cvText = extractedText;
                        localStorage.setItem('cvFileName', file.name);
                        localStorage.setItem('cvText', cvText);
                        showToast('CV text extracted successfully from PDF!', 'success');
                        console.log('PDF text extracted, length:', cvText.length);
                    } else {
                        throw new Error('No text content found in PDF');
                    }
                } catch (error) {
                    console.error('PDF extraction error:', error);
                    cvText = `[CV File: ${file.name} - PDF text extraction failed: ${error.message}]`;
                    localStorage.setItem('cvFileName', file.name);
                    localStorage.setItem('cvText', cvText);
                    showToast('Failed to extract text from PDF. Try converting to .txt format.', 'error');
                }
            };
            pdfReader.readAsArrayBuffer(file);
        } else {
            cvText = `[CV File: ${file.name}]`;
            localStorage.setItem('cvFileName', file.name);
            localStorage.setItem('cvText', cvText);
            showToast('CV uploaded successfully', 'success');
        }
    }
});

// Generate Email
generateBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const jobPost = jobPostInput.value.trim();
    const additionalInfo = additionalInfoInput.value.trim();
    const model = modelSelect.value;

    // Validation
    if (!apiKey) {
        showToast('Please enter your Groq API key', 'error');
        return;
    }

    if (!jobPost && !uploadedScreenshot) {
        showToast('Please paste a job post or upload a screenshot', 'error');
        return;
    }

    // Show loading state
    showLoading();

    try {
        let jobPostText = jobPost;

        // If screenshot is uploaded, extract text from it first
        if (uploadedScreenshot && !jobPost) {
            showToast('Extracting text from screenshot...', 'info');
            jobPostText = await extractTextFromImage(apiKey, model, uploadedScreenshot);
        }

        // Step 1: Extract job information
        const jobInfoData = await extractJobInfo(apiKey, model, jobPostText);
        displayJobInfo(jobInfoData);

        // Step 2: Generate email with CV context
        const emailData = await generateEmail(apiKey, model, jobPostText, additionalInfo, jobInfoData);
        displayEmail(emailData);

        showToast('Email generated successfully!', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Failed to generate email. Please check your API key and try again.', 'error');
        hideLoading();
    }
});

// Extract text from image using Groq Vision API
async function extractTextFromImage(apiKey, model, imageBase64) {
    try {
        showToast('Extracting text from image using Vision AI...', 'info');

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Vision-capable model
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract all the text from this job post image. Please provide the complete job description including job title, company name, location, requirements, responsibilities, and any other relevant information. Format it clearly and maintain the structure.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageBase64
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 2048
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Vision API request failed: ${response.status}`);
        }

        const data = await response.json();
        const extractedText = data.choices[0].message.content;

        showToast('Text extracted successfully!', 'success');
        return extractedText;
    } catch (error) {
        console.error('Vision API Error:', error);
        throw new Error('Failed to extract text from image: ' + error.message);
    }
}

// Extract Job Information using Groq
async function extractJobInfo(apiKey, model, jobPost) {
    // Add CV context for portfolio extraction
    let cvContextForExtraction = '';
    if (cvText && cvText.length > 50) {
        cvContextForExtraction = `\n\nCandidate's CV/Resume:\n${cvText}\n\nIMPORTANT: Also extract the candidate's portfolio URL from the CV if available (look for portfolio, website, or vercel.app links).`;
    }

    const prompt = `Extract the following information from this job post and return ONLY a valid JSON object with these exact keys:

Job Post:
${jobPost}
${cvContextForExtraction}

Return a JSON object with these fields (use "Not specified" if information is not available):
{
    "jobTitle": "extracted job title",
    "company": "company name",
    "location": "job location",
    "jobType": "full-time/part-time/contract/etc",
    "experience": "required experience level",
    "skills": "key skills required (comma-separated)",
    "recruiterEmail": "recruiter or contact email if provided in the post",
    "portfolioUrl": "candidate's portfolio URL from CV (if provided)"
}

IMPORTANT: 
- Look for email addresses in the job post for recruiterEmail
- Look for portfolio/website URLs in the CV for portfolioUrl (common patterns: https://...vercel.app, https://portfolio..., etc.)

Return ONLY the JSON object, no additional text.`;

    const response = await callGroqAPI(apiKey, model, prompt);

    try {
        // Try to parse the response as JSON
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Invalid JSON response');
    } catch (e) {
        // If parsing fails, return a default structure
        return {
            jobTitle: "Not specified",
            company: "Not specified",
            location: "Not specified",
            jobType: "Not specified",
            experience: "Not specified",
            skills: "Not specified",
            recruiterEmail: "Not specified",
            portfolioUrl: "Not specified"
        };
    }
}

// Generate Email using Groq
async function generateEmail(apiKey, model, jobPost, additionalInfo, jobInfoData) {
    let cvContext = '';

    console.log('CV Text Length:', cvText.length);
    console.log('CV Text Preview:', cvText.substring(0, 200));

    // Get portfolio URL from extracted job info (AI extracted it)
    const portfolioUrl = jobInfoData.portfolioUrl && jobInfoData.portfolioUrl !== "Not specified"
        ? jobInfoData.portfolioUrl
        : '';

    if (cvText && cvText.length > 50) { // Make sure we have actual content
        cvContext = `\n\nCandidate's CV/Resume Content:\n${cvText}\n\n${portfolioUrl ? `Candidate's Portfolio: ${portfolioUrl}\n\n` : ''}IMPORTANT: Use the information from the CV to understand the candidate's background, but DON'T list or describe individual projects in detail. Instead, briefly mention relevant skills and experience (2-3 key points max), then ${portfolioUrl ? 'ALWAYS include a reference to the portfolio website where they can see detailed projects and work samples' : 'mention that detailed work samples are available upon request'}. Keep the email concise and professional.`;
    } else if (cvText) {
        cvContext = `\n\nNote: CV file uploaded (${cvText}). ${portfolioUrl ? `Portfolio: ${portfolioUrl}` : ''}. Write a general professional email expressing interest and qualifications${portfolioUrl ? ', and reference the portfolio' : ''}.`;
    }

    const prompt = `You are a professional job application email writer. Based on the following job post and information, write a compelling and professional job application email.

Job Post:
${jobPost}

${additionalInfo ? `Additional Information:\n${additionalInfo}\n` : ''}

Extracted Job Information:
- Job Title: ${jobInfoData.jobTitle}
- Company: ${jobInfoData.company}
- Location: ${jobInfoData.location}
${cvContext}

Instructions:
1. Write a professional subject line
2. Write a compelling email body that:
   - Addresses the hiring manager professionally
   - Expresses genuine interest in the position
   - Briefly highlights relevant skills and experience (2-3 key points max)
   - Shows enthusiasm for the company/role
   - IMPORTANT: Instead of listing projects, ${portfolioUrl ? `direct them to the portfolio website (${portfolioUrl})` : 'mention that work samples and project details are available upon request'}
   - Includes a strong call to action
   - Maintains a professional yet personable tone
   - Is concise (3 short paragraphs maximum)
   - References ${portfolioUrl ? 'both the CV attachment and portfolio website' : 'the CV attachment'}

Format your response as JSON:
{
    "subject": "subject line here",
    "body": "email body here with proper line breaks"
}

Return ONLY the JSON object.`;

    const response = await callGroqAPI(apiKey, model, prompt);

    try {
        // Try to find JSON in markdown code blocks first
        let jsonStr = response.trim();

        // Remove markdown code block markers if present
        jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        // Find the JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            let jsonText = jsonMatch[0];

            // Try parsing directly first
            try {
                const parsed = JSON.parse(jsonText);
                if (parsed.subject && parsed.body) {
                    return parsed;
                }
            } catch (parseError) {
                console.log('Direct JSON parse failed, trying cleanup...');

                // Extract subject and body using regex with better control character handling
                const subjectMatch = jsonText.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                const bodyMatch = jsonText.match(/"body"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/);

                if (subjectMatch && bodyMatch) {
                    // Properly unescape the strings
                    const subject = subjectMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\r/g, '\r')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');

                    const body = bodyMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\r/g, '\r')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');

                    return { subject, body };
                }
            }
        }
        throw new Error('Invalid JSON response');
    } catch (e) {
        console.error('JSON parsing error:', e);
        console.log('Raw response:', response);

        // Final fallback: extract any text that looks like subject/body
        const lines = response.split('\n');
        let subject = `Application for ${jobInfoData.jobTitle} Position`;
        let body = response;

        // Try to find subject line
        for (const line of lines) {
            if (line.toLowerCase().includes('subject') && line.includes(':')) {
                subject = line.split(':').slice(1).join(':').trim().replace(/["']/g, '');
                break;
            }
        }

        return { subject, body };
    }
}

// Call Groq API
async function callGroqAPI(apiKey, model, prompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Display Job Information
function displayJobInfo(jobInfoData) {
    jobInfo.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div>
                <span class="font-semibold text-gray-600">Job Title:</span>
                <p class="text-gray-800">${jobInfoData.jobTitle}</p>
            </div>
            <div>
                <span class="font-semibold text-gray-600">Company:</span>
                <p class="text-gray-800">${jobInfoData.company}</p>
            </div>
            <div>
                <span class="font-semibold text-gray-600">Location:</span>
                <p class="text-gray-800">${jobInfoData.location}</p>
            </div>
            <div>
                <span class="font-semibold text-gray-600">Job Type:</span>
                <p class="text-gray-800">${jobInfoData.jobType}</p>
            </div>
            <div class="col-span-2">
                <span class="font-semibold text-gray-600">Required Experience:</span>
                <p class="text-gray-800">${jobInfoData.experience}</p>
            </div>
            <div class="col-span-2">
                <span class="font-semibold text-gray-600">Key Skills:</span>
                <p class="text-gray-800">${jobInfoData.skills}</p>
            </div>
            ${jobInfoData.portfolioUrl && jobInfoData.portfolioUrl !== "Not specified" ? `
            <div class="col-span-2">
                <span class="font-semibold text-gray-600">Portfolio:</span>
                <p class="text-gray-800 flex items-center gap-2">
                    <i class="fas fa-globe text-indigo-600"></i>
                    <a href="${jobInfoData.portfolioUrl}" target="_blank" class="text-indigo-600 hover:underline">${jobInfoData.portfolioUrl}</a>
                </p>
            </div>
            ` : ''}
            ${jobInfoData.recruiterEmail && jobInfoData.recruiterEmail !== "Not specified" ? `
            <div class="col-span-2">
                <span class="font-semibold text-gray-600">Recruiter Email:</span>
                <p class="text-gray-800 flex items-center gap-2">
                    <i class="fas fa-envelope text-blue-600"></i>
                    ${jobInfoData.recruiterEmail}
                </p>
            </div>
            ` : ''}
        </div>
    `;
    jobInfoSection.classList.remove('hidden');

    // Auto-fill recruiter email if found
    if (jobInfoData.recruiterEmail && jobInfoData.recruiterEmail !== "Not specified") {
        toEmail.value = jobInfoData.recruiterEmail;
        showToast('Recruiter email auto-filled!', 'success');
    }

    // Show portfolio extracted notification
    if (jobInfoData.portfolioUrl && jobInfoData.portfolioUrl !== "Not specified") {
        showToast('Portfolio URL extracted from CV!', 'success');
    }
}

// Display Email
function displayEmail(emailData) {
    emailSubject.textContent = emailData.subject;
    emailBody.textContent = emailData.body + "\n\n";

    // Load last recipient email if exists
    const lastRecipient = localStorage.getItem('lastRecipientEmail');
    if (lastRecipient && !toEmail.value) {
        toEmail.value = lastRecipient;
    }

    hideLoading();
    placeholder.classList.add('hidden');
    emailSection.classList.remove('hidden');
}

// Copy Email to Clipboard
copyBtn.addEventListener('click', () => {
    const subject = emailSubject.textContent;
    const body = emailBody.textContent;
    const fullEmail = `Subject: ${subject}\n\n${body}`;

    navigator.clipboard.writeText(fullEmail).then(() => {
        showToast('Email copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy email', 'error');
    });
});

// Open Mailto (traditional email client)
openMailtoBtn.addEventListener('click', () => {
    const to = toEmail.value.trim();
    const subject = emailSubject.textContent;
    const body = emailBody.textContent;

    if (!to) {
        showToast('Please enter recipient email address', 'error');
        return;
    }

    // Save recipient email to localStorage for convenience
    localStorage.setItem('lastRecipientEmail', to);

    // Create mailto link
    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Open email client in new tab/window
    window.open(mailtoLink, '_blank');
    showToast('Opening your email client in new tab...', 'success');
});

// Clear Form
clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the generated email? (Your CV and settings will be preserved)')) {
        jobPostInput.value = '';
        additionalInfoInput.value = '';
        uploadedScreenshot = null;
        screenshotInput.value = '';
        imagePreview.classList.add('hidden');
        dropZone.classList.remove('hidden');
        toEmail.value = '';
        emailSection.classList.add('hidden');
        jobInfoSection.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
});

// Show Loading State
function showLoading() {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
    placeholder.classList.add('hidden');
    emailSection.classList.add('hidden');
    loadingState.classList.remove('hidden');
}

// Hide Loading State
function hideLoading() {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Application Email';
    loadingState.classList.add('hidden');
}

// Show Toast Notification
function showToast(message, type = 'info') {
    toastMessage.textContent = message;
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transition-opacity ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800'
        } text-white`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Load PDF.js library dynamically
async function loadPDFJSLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof pdfjsLib !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
            // Set worker path
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load PDF.js library'));
        document.head.appendChild(script);
    });
}

// Extract text from PDF using PDF.js
async function extractTextFromPDF(arrayBuffer) {
    try {
        // Load the PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        let fullText = '';

        // Extract text from each page
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Combine text items with proper spacing
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');

            fullText += pageText + '\n\n';
        }

        return fullText.trim();
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw error;
    }
}
