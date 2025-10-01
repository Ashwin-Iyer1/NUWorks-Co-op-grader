"""
Co-op job scraper and analyzer for Northeastern University.
Fetches jobs from NUWorks and scores them using OpenAI.
"""

import json
import logging
import os
import sys
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv
import fetchOpenAi

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('job_scraper.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class JobScraper:
    """Handles fetching and processing job data from NUWorks."""
    
    def __init__(self):
        load_dotenv()
        self.cookie = os.getenv("NUWORKS_COOKIE")
        if not self.cookie:
            raise ValueError("NUWORKS_COOKIE environment variable is required")
        
        self.base_url = "https://northeastern-csm.symplicity.com"
        self.api_url = f"{self.base_url}/api/v2/jobs"
        self.job_url_template = f"{self.base_url}/students/app/jobs/search"
        
        self.headers = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9,es;q=0.8",
            "authorization": "Basic 389a31571f68ca0e41f75e03d30b3e30",
            "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-system-user": "students",
            "Cookie": self.cookie
        }
        
        self.params = {
            "perPage": 100,
            "page": 0,
            "sort": "!postdate",
            "ocr": "f",
            "job_type": 5,
            "industry": "112,147,24,109,83,116,141,142,143,89,105,104,97",
            "postdate": 7,
            "json_mode": "read_only",
            "enable_translation": False
        }

    def fetch_jobs(self) -> Optional[Dict]:
        """Fetch jobs from NUWorks API."""
        try:
            logger.info("Fetching jobs from NUWorks API...")
            response = requests.get(
                self.api_url, 
                headers=self.headers, 
                params=self.params,
                timeout=30
            )
            response.raise_for_status()
            
            jobs_data = response.json()
            logger.info(f"Successfully fetched {len(jobs_data.get('models', []))} jobs")
            return jobs_data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch jobs: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            return None

    def save_response(self, data: Dict, filename: str = "response.json") -> None:
        """Save response data to JSON file."""
        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            logger.info(f"Response saved to {filename}")
        except IOError as e:
            logger.error(f"Failed to save response to {filename}: {e}")

    def generate_job_url(self, job_id: str) -> str:
        """Generate job URL for a given job ID."""
        url_params = {
            "perPage": 100,
            "page": 1,
            "sort": "!postdate",
            "ocr": "f",
            "job_type": 5,
            "industry": "112,147,24,109,83,116,141,142,143,89,105,104,97",
            "postdate": 7,
            "currentJobId": job_id
        }
        
        param_string = "&".join([f"{k}={v}" for k, v in url_params.items()])
        return f"{self.job_url_template}?{param_string}"

    def process_jobs(self, jobs_data: Dict, min_score: int = 50) -> List[Dict]:
        """Process jobs and filter based on AI scoring."""
        if not jobs_data or 'models' not in jobs_data:
            logger.warning("No jobs data to process")
            return []

        good_jobs = []
        total_jobs = len(jobs_data['models'])
        
        logger.info(f"Processing {total_jobs} jobs...")
        
        for i, job in enumerate(jobs_data['models'], 1):
            try:
                job_title = job.get('job_title', 'Unknown Title')
                company_name = job.get('name', 'Unknown Company')
                job_description = job.get('job_desc', '')
                job_id = job.get('job_id', '')
                
                logger.info(f"Processing job {i}/{total_jobs}: {job_title} at {company_name}")
                
                # Get AI score
                score_str = fetchOpenAi.getJobScore(company_name, job_title, job_description)
                score_str = score_str.strip() if score_str else "0"
                
                if score_str.isdigit():
                    score = int(score_str)
                    if score >= min_score:
                        job_data = {
                            "jobTitle": job_title,
                            "companyName": company_name,
                            "score": score_str,
                            "url": self.generate_job_url(job_id)
                        }
                        good_jobs.append(job_data)
                        with open("goodJobs.json", "w") as f:
                            json.dump({"jobs": good_jobs}, f, indent=4, ensure_ascii=False)
                        logger.info(f"✓ Added job with score {score}")
                    else:
                        logger.info(f"✗ Skipped job with score {score}")
                else:
                    logger.warning(f"Invalid score received: {score_str}")
                    
            except Exception as e:
                logger.error(f"Error processing job {i}: {e}")
                continue
        
        logger.info(f"Found {len(good_jobs)} qualifying jobs")
        return good_jobs

    def save_good_jobs(self, good_jobs: List[Dict], filename: str = "goodJobs.json") -> None:
        """Save filtered good jobs to JSON file."""
        try:
            jobs_data = {"jobs": good_jobs}
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(jobs_data, f, indent=4, ensure_ascii=False)
            logger.info(f"Good jobs saved to {filename}")
        except IOError as e:
            logger.error(f"Failed to save good jobs to {filename}: {e}")


def main():
    """Main function to run the job scraper."""
    try:
        scraper = JobScraper()
        
        # Fetch jobs
        jobs_data = scraper.fetch_jobs()
        if not jobs_data:
            logger.error("Failed to fetch jobs. Exiting.")
            sys.exit(1)
        
        # Save raw response
        scraper.save_response(jobs_data)
        
        # Process and filter jobs
        good_jobs = scraper.process_jobs(jobs_data, min_score=50)
        
        # Save good jobs
        scraper.save_good_jobs(good_jobs)
        
        logger.info("Job scraping completed successfully!")
        
    except Exception as e:
        logger.error(f"Unexpected error in main: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()