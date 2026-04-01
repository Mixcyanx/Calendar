export interface ScheduleItem {
  id: string;
  date: string;
  course: string;
  todo: string;
  note: string;
  isExam: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type Theme = 'tech' | 'dark' | 'white';
