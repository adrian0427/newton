/** Newton's own apple silhouette, with a font-independent N monogram. */
export default function AppleLogo({ size = 32 }: { size?: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32">
    <path fill="#B85C46" d="M16 10.9C12.9 8.9 9.5 8.8 6.8 11.3C2.2 15.6 5.1 23.9 9.2 28.1C11.4 30.4 13.2 29.2 16 28.5C18.7 29.4 20.7 30.1 22.8 27.9C27.4 23.3 30 15.6 25.7 11.6C23.1 9.2 19.2 9 16 10.9Z" />
    <path fill="#B85C46" d="M14.5 11C14.6 9.4 14.1 8.1 13.2 7.2C12.8 6.8 12.8 6.2 13.2 5.8C13.6 5.4 14.2 5.4 14.6 5.8C16 7.2 16.6 9 16.5 11Z" />
    <path fill="#718365" d="M17.4 8C17.6 4.5 20.3 2.2 24.7 2.4C24.1 6.4 21.5 8.5 17.4 8Z" />
    <path fill="#F8F7F2" d="M11.3 24V14.5H13.2L19 21.1V14.5H20.7V24H18.9L13 17.2V24Z" />
  </svg>;
}
