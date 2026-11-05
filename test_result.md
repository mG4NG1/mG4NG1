#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "SubbieNet – subcontractor crew app. Free: be found/added, reply to messages. Pro ($2.99/wk via RevenueCat): initiate chats, business profile, crew map (approx areas), nearby search 25 km. New this round: Twilio SMS (invites, phone verification code, crew-request text alert), display picture (portrait photo or business logo via Emergent Object Storage), private contact lists."

backend:
  - task: "Display picture upload/serve (POST/DELETE /api/profile/picture, GET /api/files/{path}?token=)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py, /app/backend/storage.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Uploads to Emergent Object Storage; picture stored as /api/files/<path>; read requires bearer header or ?token=. Curl verified 200/401."
  - task: "Twilio SMS endpoints (GET /api/sms/status, POST /api/phone/send-code, POST /api/phone/verify, POST /api/invites, PUT /api/settings, POST /api/contacts/check)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py, /app/backend/sms.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Twilio creds NOT yet configured: send-code/invites must return 503 'Text messaging isn't set up yet' (invites per-number error). Crew request alert is a background task that no-ops without Twilio."
frontend:
  - task: "Profile screen (Facebook-style header, verified badge, SMS toggle, privacy note, invite menu)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "SMS toggle row only shows when /sms/status messaging=true (hidden now)."
  - task: "Onboarding picture picker + phone verify"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/onboarding.tsx, /app/frontend/src/components/picture-picker.tsx, /app/frontend/src/components/phone-verify.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "PhoneVerify hidden when verify not configured. Picture picker uploads via uploadForm."
  - task: "Invite screen (/invite)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/invite.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Shows 'Text invites aren't switched on yet' notice while Twilio unconfigured."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1

test_plan:
  current_focus:
    - "All backend endpoints incl. existing crew/messages/search"
    - "Frontend: login gate, profile, edit profile picture picker, invite screen, find, inbox, chat reply-only gating"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Test users seeded via /app/backend/seed_test_users.py (tokens in /app/memory/test_credentials.md). Web preview: localStorage.setItem('session_token', JSON.stringify('test_token_1')) then reload. Twilio not configured by design yet — verify graceful 503s, not failures."

# --- Iteration 3: Work board (jobs + looking-for-work broadcasts) ---
backend:
  - task: "Posts API (/api/posts list/create/get/keen/close, /api/posts/options, /api/posts/by-user/{id}) – Pro only, visible to crew + within 25 km"
    implemented: true
    working: "NA"
    file: "/app/backend/posts.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
frontend:
  - task: "Work tab, New post composer (/post/new), Post detail (/post/[id]) with I'm keen + close, person board"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/work.tsx, /app/frontend/app/post/new.tsx, /app/frontend/app/post/[id].tsx, /app/frontend/src/components/post-card.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
agent_communication:
  - agent: "main"
    message: "user_test2 (test_token_2) is lifetime Pro; user_test1 (test_token_1) is free and must get 402 on /api/posts. For visibility tests, make the two users crew (accept the pending request) or set both approx_lat/approx_lng via POST /api/location."
