import { useEffect, useState } from 'react'
import { avatarBlob } from '../lib/api'
import { cloudMode } from '../lib/supabase'
import type { Profile } from '../lib/types'

export default function Avatar({ profile, large = false, previewURL, memberAvatar = false }: { profile: Pick<Profile, 'id' | 'display_name' | 'avatar_key' | 'avatar_data_url'>; large?: boolean; previewURL?: string | null; memberAvatar?: boolean }) {
  const [source, setSource] = useState(''), [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true, objectURL = ''
    setSource(''); setFailed(false)
    if (previewURL !== undefined) setSource(previewURL || '')
    else if (cloudMode && profile.avatar_key) {
      avatarBlob(memberAvatar ? profile.id : undefined).then(blob => {
        if (active) { objectURL = URL.createObjectURL(blob); setSource(objectURL) }
      }).catch(() => { if (active) setFailed(true) })
    } else if (!cloudMode) setSource(profile.avatar_data_url || '')
    return () => { active = false; if (objectURL) URL.revokeObjectURL(objectURL) }
  }, [profile.id, profile.avatar_key, profile.avatar_data_url, previewURL, memberAvatar])
  return <div className={`user-avatar${large ? ' profile-avatar' : ''}`}>
    {source && !failed ? <img src={source} alt={`Ảnh đại diện của ${profile.display_name}`} onError={() => setFailed(true)} /> : <span aria-label="Ảnh đại diện mặc định">{profile.display_name.slice(0, 1).toUpperCase()}</span>}
  </div>
}
