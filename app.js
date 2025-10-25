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

// New elements for screenshot and CV
const screenshotInput = document.getElementById('screenshotInput');
const dropZone = document.getElementById('dropZone');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImage = document.getElementById('removeImage');
const cvInput = document.getElementById('cvInput');
const cvStatus = document.getElementById('cvStatus');
const cvFileName = document.getElementById('cvFileName');

// Email sending elements
const sendEmailBtn = document.getElementById('sendEmailBtn');
const openMailtoBtn = document.getElementById('openMailtoBtn');
const toEmail = document.getElementById('toEmail');
const fromEmail = document.getElementById('fromEmail');
const fromName = document.getElementById('fromName');
const attachCV = document.getElementById('attachCV');

// Gmail SMTP elements
const gmailEmail = document.getElementById('gmailEmail');
const gmailAppPassword = document.getElementById('gmailAppPassword');

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
    
    const savedFromEmail = localStorage.getItem('fromEmail');
    if (savedFromEmail) {
        fromEmail.value = savedFromEmail;
    }
    
    const savedFromName = localStorage.getItem('fromName');
    if (savedFromName) {
        fromName.value = savedFromName;
    }
    
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        modelSelect.value = savedModel;
    }
    
    // Load Gmail settings
    const savedGmailEmail = localStorage.getItem('gmailEmail');
    if (savedGmailEmail) {
        gmailEmail.value = savedGmailEmail;
    }
    
    const savedGmailPassword = localStorage.getItem('gmailAppPassword');
    if (savedGmailPassword) {
        gmailAppPassword.value = savedGmailPassword;
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

// Save model selection
modelSelect.addEventListener('change', () => {
    localStorage.setItem('selectedModel', modelSelect.value);
});

// Save API key to localStorage when changed
apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('groqApiKey', apiKeyInput.value);
});

// Save email info to localStorage
fromEmail.addEventListener('change', () => {
    localStorage.setItem('fromEmail', fromEmail.value);
});

fromName.addEventListener('change', () => {
    localStorage.setItem('fromName', fromName.value);
});

// Save Gmail settings
gmailEmail.addEventListener('change', () => {
    localStorage.setItem('gmailEmail', gmailEmail.value);
});

gmailAppPassword.addEventListener('change', () => {
    localStorage.setItem('gmailAppPassword', gmailAppPassword.value);
});

// Screenshot Upload Handling
dropZone.addEventListener('click', () => {
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

screenshotInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleScreenshotUpload(file);
    }
});

removeImage.addEventListener('click', (e) => {
    e.preventDefault();
    uploadedScreenshot = null;
    screenshotInput.value = '';
    imagePreview.classList.add('hidden');
    dropZone.classList.remove('hidden');
});

// Clipboard Paste Handling for Images
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

// Visual feedback for paste availability
window.addEventListener('focus', () => {
    dropZone.setAttribute('title', 'Press Ctrl+V to paste an image from clipboard');
});

async function handleScreenshotUpload(file) {
    if (file.size > 10 * 1024 * 1024) {
        showToast('Image size must be less than 10MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedScreenshot = e.target.result;
        previewImg.src = e.target.result;
        imagePreview.classList.remove('hidden');
        dropZone.classList.add('hidden');
        showToast('Screenshot uploaded successfully', 'success');
    };
    reader.readAsDataURL(file);
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
        } else if (file.type === 'application/pdf') {
            // For PDF files, we'll extract text using the Groq API
            const pdfReader = new FileReader();
            pdfReader.onload = async (event) => {
                const base64PDF = event.target.result;
                cvText = `[CV File: ${file.name} - PDF format]`;
                
                // Save basic info to localStorage
                localStorage.setItem('cvFileName', file.name);
                localStorage.setItem('cvText', cvText);
                showToast('CV uploaded successfully (PDF format)', 'success');
            };
            pdfReader.readAsDataURL(file);
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
    const prompt = `Extract the following information from this job post and return ONLY a valid JSON object with these exact keys:

Job Post:
${jobPost}

Return a JSON object with these fields (use "Not specified" if information is not available):
{
    "jobTitle": "extracted job title",
    "company": "company name",
    "location": "job location",
    "jobType": "full-time/part-time/contract/etc",
    "experience": "required experience level",
    "skills": "key skills required (comma-separated)",
    "recruiterEmail": "recruiter or contact email if provided in the post"
}

IMPORTANT: Look for email addresses in the job post. Common patterns include:
- "Contact us at: email@example.com"
- "Send your resume to: email@example.com"
- "Apply at: email@example.com"
- Any email address mentioned for applications

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
            recruiterEmail: "Not specified"
        };
    }
}

// Generate Email using Groq
async function generateEmail(apiKey, model, jobPost, additionalInfo, jobInfoData) {
    let cvContext = '';
    if (cvText && cvText.length > 50) { // Make sure we have actual content
        cvContext = `\n\nCandidate's CV/Resume Content:\n${cvText}\n\nIMPORTANT: Use the specific information from the CV above to personalize the email. Mention relevant experience, skills, projects, and qualifications that match the job requirements. Be specific and reference actual details from the CV.`;
    } else if (cvText) {
        cvContext = `\n\nNote: CV file uploaded (${cvText}). Write a general professional email expressing interest and qualifications.`;
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
   - Highlights relevant skills and experience from the CV (be specific!)
   - Shows enthusiasm for the company/role
   - Mentions specific qualifications that match the job requirements
   - Includes a strong call to action
   - Maintains a professional yet personable tone
   - Is concise (3-4 paragraphs)
   - References the CV attachment

Format your response as JSON:
{
    "subject": "subject line here",
    "body": "email body here with proper line breaks"
}

Return ONLY the JSON object.`;

    const response = await callGroqAPI(apiKey, model, prompt);
    
    try {
        // Try to find JSON in markdown code blocks first
        let jsonStr = response;
        
        // Remove markdown code block markers if present
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // Find the JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Ensure we have both subject and body
            if (parsed.subject && parsed.body) {
                return parsed;
            }
        }
        throw new Error('Invalid JSON response');
    } catch (e) {
        console.error('JSON parsing error:', e);
        console.log('Raw response:', response);
        // If parsing fails, try to extract subject and body manually
        const subjectMatch = response.match(/"subject":\s*"([^"]+)"/i);
        const bodyMatch = response.match(/"body":\s*"([\s\S]+?)"\s*\}/i);
        
        if (subjectMatch && bodyMatch) {
            return {
                subject: subjectMatch[1],
                body: bodyMatch[1].replace(/\\n/g, '\n')
            };
        }
        
        // Last resort: return the raw response
        return {
            subject: `Application for ${jobInfoData.jobTitle} Position`,
            body: response
        };
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
}

// Display Email
function displayEmail(emailData) {
    emailSubject.textContent = emailData.subject;
    emailBody.textContent = emailData.body;
    
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

// Send Email via Gmail SMTP
sendEmailBtn.addEventListener('click', async () => {
    const to = toEmail.value.trim();
    const from = fromEmail.value.trim();
    const name = fromName.value.trim();
    const subject = emailSubject.textContent;
    const body = emailBody.textContent;
    const gmail = gmailEmail.value.trim();
    const password = gmailAppPassword.value.trim();
    
    // Validation
    if (!to) {
        showToast('Please enter recipient email address', 'error');
        return;
    }
    
    if (!from) {
        showToast('Please enter your email address', 'error');
        return;
    }
    
    if (!name) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    if (!gmail || !password) {
        showToast('Please configure Gmail settings first', 'error');
        return;
    }
    
    try {
        sendEmailBtn.disabled = true;
        sendEmailBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...';
        
        // Prepare email with attachment
        let emailParams = {
            SecureToken: btoa(gmail + ':' + password), // Basic encoding
            To: to,
            From: gmail,
            Subject: subject,
            Body: body.replace(/\n/g, '<br>')
        };
        
        // Add CV attachment if checked and available
        if (attachCV.checked && cvFileData) {
            emailParams.Attachments = [{
                name: cvFileData.name,
                data: cvFileData.data
            }];
        }
        
        // Send via SMTP.js
        await Email.send({
            Host: "smtp.gmail.com",
            Username: gmail,
            Password: password,
            To: to,
            From: gmail,
            Subject: subject,
            Body: body.replace(/\n/g, '<br>'),
            Attachments: attachCV.checked && cvFileData ? [{
                name: cvFileData.name,
                data: cvFileData.data.split(',')[1] // Remove data:type prefix
            }] : undefined
        });
        
        showToast('Email sent successfully via Gmail! ✅', 'success');
        localStorage.setItem('lastRecipientEmail', to);
        
    } catch (error) {
        console.error('Email sending error:', error);
        showToast('Failed to send email: ' + (error.message || 'Please check your Gmail settings'), 'error');
    } finally {
        sendEmailBtn.disabled = false;
        sendEmailBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send via Gmail';
    }
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
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transition-opacity ${
        type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800'
    } text-white`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
