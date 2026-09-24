import type { SalesMeeting } from './meetingService';
import type { CRMDiscoveryQuestion, CRMDiscoveryResponse, CRMClientVoiceEntry, CRMSalesDiscoveryWorkspace } from './crmSalesDiscoveryService';
import { getDiscoveryQuestionConfiguration, hasMeaningfulDiscoveryAnswer } from './crmDiscoveryUtils';

export type CRMMeetingPhase = 'UPCOMING' | 'MEETING_TIME' | 'NEEDS_CLOSEOUT' | 'COMPLETED' | 'NO_SHOW';

export function getMeetingManagementPhase(meeting: SalesMeeting, now = Date.now()): CRMMeetingPhase {
  if (meeting.status === 'Completed') return 'COMPLETED';
  if (meeting.status === 'No Show') return 'NO_SHOW';
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();
  if (Number.isFinite(start) && now < start) return 'UPCOMING';
  if (Number.isFinite(end) && now <= end) return 'MEETING_TIME';
  return 'NEEDS_CLOSEOUT';
}

export function getMeetingManagementCandidates(meetings: SalesMeeting[], now = Date.now()): SalesMeeting[] {
  const active = meetings.filter(meeting => meeting.status === 'Scheduled' || meeting.status === 'Rescheduled');
  const due = active
    .filter(meeting => new Date(meeting.startAt).getTime() <= now)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const upcoming = active
    .filter(meeting => new Date(meeting.startAt).getTime() > now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const closed = meetings
    .filter(meeting => meeting.status === 'Completed' || meeting.status === 'No Show')
    .sort((a, b) => new Date(b.completedAt ?? b.startAt).getTime() - new Date(a.completedAt ?? a.startAt).getTime());
  return [...due, ...upcoming, ...closed];
}

export function chooseDefaultManagedMeeting(meetings: SalesMeeting[], now = Date.now()): SalesMeeting | null {
  return getMeetingManagementCandidates(meetings, now)[0] ?? null;
}

export function isDiscoveryResponseResolved(response?: CRMDiscoveryResponse): boolean {
  if (!response) return false;
  if (response.question_state === 'NOT_APPLICABLE') return true;
  if (response.question_state !== 'ANSWERED') return false;
  if (!hasMeaningfulDiscoveryAnswer(response)) return false;
  return response.information_certainty !== 'AWAITING_CLIENT'
    && response.information_certainty !== 'NEEDS_SPECIALIST_VALIDATION'
    && !response.follow_up_required;
}

export function deriveMeetingOpenQuestions(
  workspace: CRMSalesDiscoveryWorkspace,
  selectedQuestionIds: string[],
): Array<{ question: CRMDiscoveryQuestion; response?: CRMDiscoveryResponse; reason: string }> {
  const responseByQuestion = new Map(workspace.responses.map(response => [response.question_id, response]));
  const selected = new Set(selectedQuestionIds);
  return workspace.questions
    .filter(question => question.active)
    .filter(question => {
      const config = getDiscoveryQuestionConfiguration(question);
      return selected.has(question.id) || config.questionClass === 'CORE';
    })
    .map(question => {
      const response = responseByQuestion.get(question.id);
      if (isDiscoveryResponseResolved(response)) return null;
      let reason = 'Still unresolved.';
      if (response?.question_state === 'NEEDS_FOLLOW_UP' || response?.follow_up_required) reason = 'Needs follow-up.';
      else if (response?.information_certainty === 'AWAITING_CLIENT') reason = 'Awaiting client information.';
      else if (response?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION') reason = 'Needs specialist validation.';
      else if (!response || response.question_state === 'NOT_ASKED') reason = 'Not asked yet.';
      return { question, response, reason };
    })
    .filter((item): item is { question: CRMDiscoveryQuestion; response: CRMDiscoveryResponse | undefined; reason: string } => item !== null)
    .sort((a, b) => {
      const pa = a.response?.question_state === 'NEEDS_FOLLOW_UP' ? 0 : getDiscoveryQuestionConfiguration(a.question).questionClass === 'CORE' ? 1 : 2;
      const pb = b.response?.question_state === 'NEEDS_FOLLOW_UP' ? 0 : getDiscoveryQuestionConfiguration(b.question).questionClass === 'CORE' ? 1 : 2;
      return pa - pb || a.question.sort_order - b.question.sort_order;
    });
}

export function deriveMeetingLearnedToday(
  meetingId: string,
  responses: CRMDiscoveryResponse[],
  clientVoice: CRMClientVoiceEntry[],
  outcome?: string,
): Array<{ kind: 'Discovery' | 'Client Voice' | 'Outcome'; text: string }> {
  const items: Array<{ kind: 'Discovery' | 'Client Voice' | 'Outcome'; text: string }> = [];
  responses
    .filter(response => response.meeting_id === meetingId && hasMeaningfulDiscoveryAnswer(response))
    .forEach(response => items.push({ kind: 'Discovery', text: response.answer_text?.trim() || 'Structured Discovery information captured in this meeting.' }));
  clientVoice
    .filter(entry => entry.meeting_id === meetingId)
    .forEach(entry => items.push({ kind: 'Client Voice', text: entry.customer_statement }));
  if (outcome?.trim()) items.push({ kind: 'Outcome', text: outcome.trim() });
  return items;
}

export function meetingCustomerRecapComplete(meeting: SalesMeeting): boolean {
  return Boolean(meeting.customerSummary.trim() && meeting.customerNextStep.trim() && meeting.customerNextStepTiming.trim());
}
