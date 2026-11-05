export function formatMoney(value: number) {
  return `${new Intl.NumberFormat('uz-UZ').format(value)} so‘m`;
}

export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tashkent', hourCycle: 'h23',
  }).format(new Date(value));
}

export function formatEventDay(value: string) {
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit', month: 'short', timeZone: 'Asia/Tashkent',
  }).format(new Date(value));
}
