-- Module 19 lessons 06–10 — accounts, MFA and phishing

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='confidentiality-data-protection';
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
(v_module,'Never Share Accounts',$md$
## Objective
Preserve accountability and auditability.

## Operating rule
**One person → one authorized account.**

Never send your password, lend your login or ask another person to work as you. Shared accounts destroy audit trails and make mistakes or incidents harder to contain.

If someone legitimately needs access, request proper access.

### Practice prompt
A new seller says, “My account is not ready—can I use yours for today?” Give the correct response and next step.
$md$,6,true),
(v_module,'Strong Authentication Should Be Easy to Repeat',$md$
## Objective
Protect work accounts without relying on memory or reused passwords.

## Operating rule
Use the approved authentication method: unique credentials, MFA, passkeys or an approved password manager where supported.

Never store passwords in CRM notes, spreadsheets, quotations or ordinary chat.

### Practice prompt
Identify the risk in reusing the same password for ProFox, personal email and LinkedIn.
$md$,7,true),
(v_module,'Unexpected MFA Means Stop',$md$
## Objective
Recognize a possible account-takeover signal immediately.

## Operating rule
**If you did not initiate the login, do not approve the prompt.**

Use: **DENY → SECURE → REPORT.**

Do not approve an MFA request just to stop notifications. Someone may already have your password.

### Critical behaviour
Approving an authentication request you did not initiate can expose the account.

### Practice prompt
Your phone shows “Approve sign-in?” while you are not logging in. What do you do first, second and third?
$md$,8,true),
(v_module,'Attackers Manufacture Urgency',$md$
## Objective
Separate urgency from authority.

Messages may say: “CEO needs this now,” “customer changed bank details,” “click to review quotation,” or “your account expires today.”

## ProFox framework
**PAUSE → VERIFY → ACT**

Do not let urgency bypass normal verification.

### Practice prompt
List three warning signs that should make you verify a request independently before acting.
$md$,9,true),
(v_module,'Verify Sensitive Requests Through Another Channel',$md$
## Objective
Avoid verifying a suspicious request through the same potentially compromised message.

## Operating rule
**The more unusual or sensitive the request, the stronger the verification.**

If an email asks for a customer export, payment change, password reset or unusual file share, verify through a known trusted channel or the real ProFox system—not the phone number/link supplied inside the suspicious message.

### Practice prompt
An “Admin” email asks for all US prospects via an unfamiliar upload link. Explain the safe verification path.
$md$,10,true);
end $$;
