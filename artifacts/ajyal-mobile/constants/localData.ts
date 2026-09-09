export type Role = 'student' | 'teacher' | 'parent' | 'admin';

export type Session = {
  id: string;
  title: string;
  subject: string;
  person: string;
  date: string;
  time: string;
  scheduledAt: string;
  duration: string;
  tone: 'teal' | 'gold' | 'navy';
  status?: 'upcoming' | 'done' | 'cancelled' | 'expired';
  sessionStatus?: 'not_started' | 'waiting_acceptance' | 'in_progress' | 'completed' | 'cancelled' | 'rejected' | 'expired' | null;
};

export type Assignment = {
  id: string;
  title: string;
  subject: string;
  due: string;
  progress: number;
  kind: 'واجب' | 'اختبار';
  status: 'قيد التقدم' | 'لم يبدأ' | 'مكتمل';
};

export function isAssignmentComplete(
  assignment: Pick<Assignment, 'progress' | 'status'>,
  hasSubmission = false,
): boolean {
  return hasSubmission || assignment.status === 'مكتمل' || assignment.progress >= 100;
}

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  icon: string;
  unread: boolean;
};

export type UserProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: Role;
  roles: Role[];
  displayName: string;
  roleLabel: string;
  teachingStage: string | null;
  teacherApproved: boolean | null;
  isBanned: boolean;
};