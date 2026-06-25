import dayjs from 'dayjs';

export function toBeijingTime(value?: string | null) {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}
