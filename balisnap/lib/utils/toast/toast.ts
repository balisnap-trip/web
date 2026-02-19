import { toast, Bounce } from 'react-toastify'

export const toastr = (
  message: string,
  type: 'default' | 'success' | 'error' | 'info' | 'warning'
) => {
  return toast.success(message, {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    theme: 'light',
    transition: Bounce,
    type
  })
}
