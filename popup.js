// Popup logic
document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const mainView = document.getElementById('main-view');
    const resumeView = document.getElementById('resume-view');
    
    // Main View Inputs
    const getJobsBtn = document.getElementById('get-jobs-btn');
    const cookieInput = document.getElementById('cookie');
    const authInput = document.getElementById('authorization');
    const resultsDiv = document.getElementById('results');
    const settingsBtn = document.getElementById('settings-btn');

    // Resume View Inputs
    const resumeText = document.getElementById('resume-text');
    const saveResumeBtn = document.getElementById('save-resume-btn');
    const cancelResumeBtn = document.getElementById('cancel-resume-btn');

    // Helper: Switch Views
    const showMainView = () => {
        mainView.classList.remove('hidden');
        resumeView.classList.add('hidden');
    };

    const showResumeView = () => {
        mainView.classList.add('hidden');
        resumeView.classList.remove('hidden');
    };

    // Load stored credentials & resume check
    chrome.storage.local.get(['cookie', 'authorization', 'resume'], (result) => {
        if (result.cookie) {
            cookieInput.value = result.cookie;
        }
        if (result.authorization) {
            authInput.value = result.authorization;
        }
        
        // Resume check
        if (!result.resume || result.resume.trim() === '') {
            // No resume found, force user to enter one
            showResumeView();
        } else {
            showMainView();
        }
    });

    // --- Event Listeners ---

    // Open Settings (Resume Edit)
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            chrome.storage.local.get(['resume'], (result) => {
                if (result.resume) {
                    resumeText.value = result.resume;
                }
                showResumeView();
            });
        });
    }

    // Save Resume
    if (saveResumeBtn) {
        saveResumeBtn.addEventListener('click', () => {
            const text = resumeText.value.trim();
            if (!text) {
                alert('Please enter a resume.');
                return;
            }
            chrome.storage.local.set({ resume: text }, () => {
                console.log('Resume saved');
                showMainView();
            });
        });
    }

    // Cancel Resume Edit
    if (cancelResumeBtn) {
        cancelResumeBtn.addEventListener('click', () => {
            // Only allow cancel if we actually have a resume saved
            chrome.storage.local.get(['resume'], (result) => {
                if (result.resume && result.resume.trim() !== '') {
                    showMainView();
                } else {
                    alert('You must save a resume to continue.');
                }
            });
        });
    }

    // Get Jobs Logic
    if (getJobsBtn) {
        getJobsBtn.addEventListener('click', async () => {
            getJobsBtn.disabled = true;
            getJobsBtn.innerText = 'Fetching...';
            resultsDiv.innerText = 'Loading...';

            const baseUrl = "https://northeastern-csm.symplicity.com";
            const apiUrl = `${baseUrl}/api/v2/jobs`;

            const params = new URLSearchParams({
                perPage: document.getElementById('perPage').value,
                page: document.getElementById('page').value,
                sort: document.getElementById('sort').value,
                ocr: document.getElementById('ocr').value,
                job_type: document.getElementById('job_type').value,
                postdate: document.getElementById('postdate').value,
                json_mode: document.getElementById('json_mode').value,
                exclude_applied_jobs: document.getElementById('exclude_applied_jobs').checked ? '1' : '0',
                enable_translation: 'False' // Fixed as per requirement
            });

            const headers = {
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9,es;q=0.8",
                "authorization": authInput.value,
                "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-system-user": "students",
                "Cookie": cookieInput.value
            };

            try {
                // Fetch Logic... (Keeping existing fetch logic, might need to pass resume later for matching but user just asked for input for now)
                
                // NOTE: User objective says "maintain existing matcher logic". 
                // The prompt says "use text input for resume for now".
                // It doesn't explicitly say "integrate it into the matcher yet", but usually that's the point.
                // However, I will strictly follow "make sure they have a resume... edit... settings icon".
                // Integration can happen next or if I see a quick way.
                // The user *did* say "maintain exiting matcher logic", so I shouldn't break the existing button.
                
                const response = await fetch(`${apiUrl}?${params.toString()}`, {
                    method: 'GET',
                    headers: headers
                });

                console.log(response);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const jobs = data.models;

                // Simple processing as before
                jobs.forEach(job => {
                    job.job_desc = job.job_desc;
                    job.job_title = job.job_title;
                });

                resultsDiv.innerText = JSON.stringify(jobs, null, 2);
            } catch (error) {
                console.error("Fetch error:", error);
                resultsDiv.innerText = `Error: ${error.message}`;
            } finally {
                getJobsBtn.disabled = false;
                getJobsBtn.innerText = 'Get Jobs';
            }
        });
    }
});