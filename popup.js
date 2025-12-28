// Popup logic
document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const mainView = document.getElementById('main-view');
    const resumeView = document.getElementById('resume-view');
    
    // Main View Inputs
    const getJobsBtn = document.getElementById('get-jobs-btn');
    const cookieInput = document.getElementById('cookie');
    const authInput = document.getElementById('authorization');
    const settingsBtn = document.getElementById('settings-btn');

    // Resume View Inputs
    const resumeText = document.getElementById('resume-text');
    const saveResumeBtn = document.getElementById('save-resume-btn');
    const cancelResumeBtn = document.getElementById('cancel-resume-btn');

    // Analysis View Elements
    const analysisView = document.getElementById('analysis-view');
    const analysisResults = document.getElementById('analysis-results');
    const backToMainBtn = document.getElementById('back-to-main-btn');

    // Slider Elements
    const minMatchSlider = document.getElementById('min-match-slider');
    const minMatchValue = document.getElementById('min-match-value');

    // Helper: Switch Views
    const showMainView = () => {
        mainView.classList.remove('hidden');
        resumeView.classList.add('hidden');
        analysisView.classList.add('hidden');
    };

    const showResumeView = () => {
        mainView.classList.add('hidden');
        resumeView.classList.remove('hidden');
        analysisView.classList.add('hidden');
    };

    const showAnalysisView = () => {
        mainView.classList.add('hidden');
        resumeView.classList.add('hidden');
        analysisView.classList.remove('hidden');
    };

    // Load stored credentials & resume check
    chrome.storage.local.get(['cookie', 'authorization', 'resume'], (result) => {
        if (!result.cookie) {
            document.getElementById('cookie-check').innerText = 'Cookie not found';
        }
        if (!result.authorization) {
            document.getElementById('auth-check').innerText = 'Authorization not found';
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
            getJobsBtn.innerText = 'Analyzing...';
            
            // Get resume first
            chrome.storage.local.get(['resume'], async (storageResult) => {
                const resumeText = storageResult.resume;
                
                if (!resumeText) {
                    alert('Please save a resume first!');
                    showResumeView();
                    getJobsBtn.disabled = false;
                    getJobsBtn.innerText = 'Analyze Jobs';
                    return;
                }

                const baseUrl = "https://northeastern-csm.symplicity.com";
                const apiUrl = `${baseUrl}/api/v2/jobs`;

                const params = new URLSearchParams({
                    perPage: document.getElementById('perPage').value,
                    page: 0,
                    sort: '!postdate',
                    ocr: 'f',
                    job_type: document.getElementById('job_type').value,
                    postdate: document.getElementById('postdate').value,
                    json_mode: 'read_only',
                    exclude_applied_jobs: document.getElementById('exclude_applied_jobs').checked ? '1' : '0',
                    enable_translation: 'False'
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
                    const response = await fetch(`${apiUrl}?${params.toString()}`, {
                        method: 'GET',
                        headers: headers
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    const jobs = data.models;
                    
                    // --- MATCHING LOGIC ---
                    const matcher = new JobMatcher();
                    const scoredJobs = jobs.map(job => {
                        const description = job.job_desc || ""; // Use empty string if undefined
                        const title = job.job_title || "";
                        
                        // Combine title and desc for better matching context
                        const jobFullText = `${title} \n ${description}`; 
                        const result = matcher.calculateScore(resumeText, jobFullText);
                        
                        return {
                            ...job,
                            matchScore: result.score,
                            matchDetails: result
                        };
                        return {
                            ...job,
                            matchScore: result.score,
                            matchDetails: result
                        };
                    });

                    // Filter by Min Score
                    const minScore = parseInt(minMatchSlider.value, 10) || 0;
                    const filteredJobs = scoredJobs.filter(job => job.matchScore >= minScore);

                    // Sort by score descending
                    filteredJobs.sort((a, b) => b.matchScore - a.matchScore);

                    // Render Results
                    analysisResults.innerHTML = ''; // Clear previous
                    
                    if (filteredJobs.length === 0) {
                        analysisResults.innerHTML = `<p>No jobs found matching >= ${minScore}%.</p>`;
                    } else {
                        filteredJobs.forEach(job => {
                            const card = document.createElement('div');
                            card.style.border = '1px solid #ddd';
                            card.style.marginBottom = '10px';
                            card.style.padding = '10px';
                            card.style.borderRadius = '5px';
                            card.style.backgroundColor = '#fff';

                            const title = document.createElement('div');
                            title.style.fontWeight = 'bold';
                            title.style.fontSize = '1.1em';
                            title.innerText = job.job_title;
                            
                            const company = document.createElement('div');
                            company.style.fontSize = '0.9em';
                            company.style.color = '#555';
                            company.innerText = job.employer ? job.employer.name : 'Unknown Employer';

                            const scoreLine = document.createElement('div');
                            scoreLine.style.marginTop = '5px';
                            scoreLine.style.fontWeight = 'bold';
                            
                            // Color code score
                            const score = job.matchScore;
                            let color = '#d9534f'; // red
                            if (score >= 70) color = '#5cb85c'; // green
                            else if (score >= 40) color = '#f0ad4e'; // orange
                            
                            scoreLine.innerHTML = `<span style="color: ${color};">${score}% Match</span>`;

                            // Optional: details/keywords matched could go here
                            const snippets = document.createElement('div');
                            snippets.style.fontSize = '0.8em';
                            snippets.style.color = '#777';
                            snippets.style.marginTop = '5px';
                            // Show top 3 matched kws
                            const matches = job.matchDetails.matches.slice(0, 5).join(', ');
                            if (matches) {
                                snippets.innerText = `Matched: ${matches}`;
                            }

                            card.appendChild(title);
                            card.appendChild(company);
                            card.appendChild(scoreLine);
                            if (matches) card.appendChild(snippets);

                            analysisResults.appendChild(card);
                        });
                    }

                    showAnalysisView();

                } catch (error) {
                    console.error("Fetch/Analysis error:", error);
                    alert(`Error: ${error.message}`);
                } finally {
                    getJobsBtn.disabled = false;
                    getJobsBtn.innerText = 'Analyze Jobs';
                }
            });
        });

        // Back Button Listener
        if (backToMainBtn) {
            backToMainBtn.addEventListener('click', () => {
                showMainView();
            });
        }
        
        // Slider Listener
        if (minMatchSlider && minMatchValue) {
            minMatchSlider.addEventListener('input', () => {
                minMatchValue.innerText = minMatchSlider.value;
            });
        }
    }
});