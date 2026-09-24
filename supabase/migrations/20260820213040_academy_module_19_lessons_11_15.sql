-- Module 19 lessons 11–15 — channels, sending, screen sharing, notes, recordings

do $$ declare v_module uuid; begin
 select id into v_module from public.training_modules where slug='confidentiality-data-protection';
 insert into public.training_lessons(module_id,title,content,sort_order,active) values
(v_module,'Use Approved Communication and Storage Channels',$md$
## Objective
Keep confidential information inside systems ProFox can govern.

## Operating rule
**Convenience does not override confidentiality.**

Do not move customer or company information into personal email, personal cloud storage, random transfer services or unapproved apps simply because they are faster.

Ask: **What is the approved place to share this?**

### Practice prompt
A file is too large for ordinary email. What should you verify before using any external transfer service?
$md$,11,true),
(v_module,'Check Before You Send',$md$
## Objective
Prevent wrong-recipient and wrong-attachment incidents.

## Five-second pre-send check
**RECIPIENT → FILE → PERMISSION → CHANNEL**

Verify the intended recipient, the actual attachment, whether that person should receive it, and whether the delivery method is approved.

### Example
Recipient: Client A. Attachment: Client B quotation. One five-second check prevents a serious disclosure.

### Practice prompt
Create your own repeatable five-second pre-send routine.
$md$,12,true),
(v_module,'Screen Sharing Is Data Sharing',$md$
## Objective
Prevent accidental cross-client or internal disclosure during calls.

## Operating rule
Before sharing, close unrelated CRM records, internal chats, personal email, password managers, other client documents and unnecessary notifications.

Prefer sharing one application/window rather than the entire desktop when practical.

### Practice prompt
Your desktop contains two client tabs, Slack, a password manager and the presentation. What stays visible?
$md$,13,true),
(v_module,'CRM Notes Must Be Useful, Not Dangerous',$md$
## Objective
Preserve commercial memory without turning CRM into a secret dump.

Record decision-useful facts, outcomes, stakeholders and next actions. Do not paste passwords, OTPs, card data, unnecessary personal information or unrelated gossip into normal CRM notes.

## Standard
**CRM is commercial memory—not a secret vault.**

### Practice prompt
Rewrite a CRM note that contains a password and irrelevant family details into a safe, useful business note.
$md$,14,true),
(v_module,'Recording Calls Requires the Approved Process',$md$
## Objective
Avoid creating uncontrolled copies of conversations and personal/confidential data.

## Operating rule
Record only through an approved ProFox recording workflow and any required notice/consent process. Do not improvise recording law or use a personal recording app because it is convenient.

### Practice prompt
A seller wants to record every discovery call using a personal phone app. What is the correct response?
$md$,15,true);
end $$;
