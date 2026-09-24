-- Module 19 lessons 16–20 — customer secrets, AI, exports, rights, incidents

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='confidentiality-data-protection';
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
(v_module,'Protect Customer Secrets From the Customer Too',$md$
## Objective
Handle secrets safely even when the customer sends them voluntarily.

Customers may send passwords, API keys or other credentials through ordinary chat. Do not copy them into CRM or continue using an unsafe channel.

## Operating rule
**STOP → EXPLAIN → MOVE TO THE APPROVED SECURE CREDENTIAL PROCESS.**

Never retain or use OTPs, CVVs or banking passwords.

### Practice prompt
A customer posts an admin password in chat. What should the seller do immediately?
$md$,16,true),
(v_module,'AI Is a Tool, Not a Confidentiality Exception',$md$
## Objective
Use AI productivity without leaking customer or company information.

Before sending information to an AI tool ask:
1. Is the tool approved?
2. Do I need this information for the task?
3. Can I remove names, secrets or unnecessary details?
4. Am I authorized to place this information there?

## Operating rule
**Use approved tools + minimum necessary context.**

### Practice prompt
Turn a synthetic discovery transcript containing a password and private phone number into a minimized AI-safe prompt.
$md$,17,true),
(v_module,'Downloads Create Copies',$md$
## Objective
Understand that exports create new risk and new cleanup work.

Export only when legitimately required and approved. Do not email CRM CSVs to personal accounts or keep “just in case” copies.

When the purpose ends, follow the approved retention/deletion process.

### Performance principle
Fewer unmanaged copies mean fewer mistakes, faster updates and a cleaner source of truth.

### Practice prompt
You exported a temporary list for an approved task and the task is finished. What happens next?
$md$,18,true),
(v_module,'Privacy Requests Are Not Sales Negotiations',$md$
## Objective
Recognize customer privacy/data requests and route them correctly.

A customer may ask to see stored data, correct it, delete it or stop contact. Do not improvise legal promises.

## Seller responsibility
**RECOGNIZE → RECORD → ROUTE**

Use the approved ProFox privacy/admin workflow. Never promise that everything has been legally deleted until the authorized process confirms it.

### Practice prompt
A prospect says “Delete everything you have about me.” What should Sales do and what should Sales avoid promising?
$md$,19,true),
(v_module,'Report Incidents Fast',$md$
## Objective
Contain mistakes while they are still small.

Incidents can include a lost device, wrong attachment, wrong recipient, suspicious login, malware, unexpected MFA, stolen password, accidental screen share, unauthorized export or secret pasted into the wrong place.

## ProFox incident framework
**STOP → PROTECT → REPORT → PRESERVE → FOLLOW**

- **STOP:** stop the risky action.
- **PROTECT:** take safe immediate actions you are authorized to take.
- **REPORT:** notify the approved ProFox channel immediately.
- **PRESERVE:** do not destroy evidence to hide the mistake.
- **FOLLOW:** follow incident-response instructions.

## Most important rule
**Never hide a data mistake because you are embarrassed.**

### Practice prompt
You accidentally send a confidential quotation to the wrong prospect. Walk through the five-step response.

**Final standard:** use only what you need, access only what you need, share only where authorized, and report anything suspicious immediately.
$md$,20,true);
end $$;
