export const AVATAR_LIMIT = 2 * 1024 * 1024
export async function validateAvatar(file: File) {
  if (!file.size || file.size > AVATAR_LIMIT) throw Error('Ảnh đại diện tối đa 2 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  const valid = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/webp' && text.startsWith('RIFF') && text.slice(8) === 'WEBP'
  if (!valid) throw Error('Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.')
}

export function avatarDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(Error('Không đọc được ảnh. Hãy thử lại.'))
    reader.readAsDataURL(file)
  })
}
