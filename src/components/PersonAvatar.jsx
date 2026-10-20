import { roleLabels } from '../lib/format'

const roleAvatars = {
  engineer: '/avatars/engineer.png',
  technician: '/avatars/technician.png',
  assistant: '/avatars/assistant-technician.png',
  worker: '/avatars/worker.png',
}

export default function PersonAvatar({ person, size = 52, children }) {
  if (!person || !Object.hasOwn(roleAvatars, person.role)) return children

  return (
    <img
      src={roleAvatars[person.role]}
      alt={`صورة رمزية — ${roleLabels[person.role]} — ${person.name}`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  )
}
