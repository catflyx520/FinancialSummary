export type IconName =
  | 'overview'
  | 'transactions'
  | 'accounts'
  | 'recurring'
  | 'settings'
  | 'plus'
  | 'arrow'
  | 'download'
  | 'close'
  | 'edit'
  | 'trash'
  | 'check'
  | 'leaf'
const paths: Record<IconName, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  transactions: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  accounts: 'M3 8h18L12 3 3 8zm2 3v7m7-7v7m7-7v7M3 21h18',
  recurring: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-11 4h6m-6 3h3',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',
  close: 'm6 6 12 12M6 18 18 6',
  edit: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  check: 'm5 12 4 4L19 6',
  leaf: 'M19 4C8 2 3 9 6 16s14 4 13-12ZM6 19l9-10',
}
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
