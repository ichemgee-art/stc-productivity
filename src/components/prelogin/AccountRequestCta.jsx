import { Mail } from 'lucide-react'
import { accountRequestUrl } from '../../config/preLogin'

export default function AccountRequestCta({ className = '', children = 'تواصل لطلب الوصول' }) {
  const external = /^https?:\/\//i.test(accountRequestUrl)

  return (
    <a
      className={`btn btn-primary account-request-cta ${className}`.trim()}
      href={accountRequestUrl}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <Mail size={16} />
      {children}
    </a>
  )
}
