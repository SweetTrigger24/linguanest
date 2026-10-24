import { useEffect } from 'react'

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.nav-item,.admin-tabs button,.side-language,.side-user button,[data-leave-page]') && !confirm('Có thay đổi chưa lưu. Bạn vẫn muốn rời trang?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
}
