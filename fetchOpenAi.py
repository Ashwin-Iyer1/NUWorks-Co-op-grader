"""
OpenAI client for scoring job opportunities.
"""

import logging
import os
from openai import OpenAI
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class JobScorer:
    """Handles AI-based job scoring using OpenAI."""
    
    def __init__(self):
        load_dotenv()
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        self.client = OpenAI(api_key=api_key)
        self.system_prompt = self._build_system_prompt()
        self.user_context = self._build_user_context()

    def _build_system_prompt(self) -> str:
        """Build the system prompt for job scoring."""
        return (
            "DO NOT RETURN ANY EXTRA TEXT. Return me only a single number between 0-100.\n\n"
            "0 being I am not qualified\n"
            "25 being a job that I am qualified for but not in my area of study/interest.\n"
            "50 being a job that I am qualified for and fits some of my description\n"
            "100 being a job that I am qualified for and fits my description and likely to respond to me\n\n"
            "You can use any number between 0-100, the above are checkpoint numbers. "
            "Make sure that I qualify for the job before giving a score above 0. "
            "If I do not qualify, return 0. (if job asks for rising seniors, return 0 as I am a sophomore, etc)"
        )

    def _build_user_context(self) -> str:
        """Build the user context for job scoring."""
        return (
            "I am currently applying to finance / computer science co-ops. "
            "I am an undergraduate sophomore at Northeastern University. "
            "I am not a final year student and have not had a co-op yet. "
            "I am seeking co-ops in the United States and I prefer co-ops where the company is in finance / math / statistics with an IT role.\n\n"
            
            "My stats are below\n"
            "Candidate for Bachelor of Science in Computer Science and Business Administration GPA: 3.7\n"
            "Honors/Activities: Scout, Forge, NU Systematic Alpha\n"
            "Relevant Coursework: Discrete Structures, Introduction to Databases, Program Design & Implementation, "
            "Business Statistics, Financial Management\n\n"
            
            "Languages: C++, Java, Python, JavaScript, TypeScript, SQL, Kotlin\n"
            "Frameworks & Libraries: React, Redux, TensorFlow, Keras, Pandas, NumPy\n"
            "Developer Tools: Git, IntelliJ, Eclipse, PyCharm, Xcode, PostgreSQL, Microsoft ADO\n\n"
                       
            "Interests\n"
            "Hackathons, Reading, Rubik's Cube, Chess, Poker, Baseball, Blogging, Football, Working Out, Watches, Shoes\n\n"
            
            "DO NOT RETURN ANY EXTRA TEXT. Return me only a single number between 0-100."
        )

    def score_job(self, company_name: str, job_title: str, job_description: str) -> str:
        """Score a job opportunity using OpenAI."""
        try:
            job_prompt = f"Company Name: {company_name}.\nJob Title: {job_title}\nJob Description: {job_description}"
            
            response = self.client.chat.completions.create(
                model="gpt-4.1-mini",  # Fixed model name
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": self.user_context},
                    {"role": "user", "content": job_prompt}
                ],
                temperature=0.3,  # Lower temperature for more consistent scoring
                max_tokens=10,  # Very small since we only need a number
                top_p=1
            )
            
            score = response.choices[0].message.content.strip()
            logger.debug(f"Scored {job_title} at {company_name}: {score}")
            return score
            
        except Exception as e:
            logger.error(f"Error scoring job {job_title} at {company_name}: {e}")
            return "0"


# Create a global instance for backward compatibility
_job_scorer = None

def getJobScore(companyName: str, jobTitle: str, jobDescription: str) -> str:
    """Legacy function for backward compatibility."""
    global _job_scorer
    if _job_scorer is None:
        _job_scorer = JobScorer()
    return _job_scorer.score_job(companyName, jobTitle, jobDescription)