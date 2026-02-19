import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner
} from '@heroui/react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { FaEnvelope, FaGoogle } from 'react-icons/fa'
import { FaFacebookF } from 'react-icons/fa6'

const LoginForm = ({ callbackUrl = '/' }: { callbackUrl?: string }) => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSignIn = async (type: string) => {
    try {
      await signIn(type, { callbackUrl })
    } catch (e) {
      // console.log(e)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    if (!email) return // Optional: Handle empty email input

    try {
      await signIn('email', { email, callbackUrl })
      setLoading(false)
    } catch (error) {
      // console.error('Error signing in:', error)
      setLoading(false)
    }
  }

  return (
    <Modal hideCloseButton backdrop="blur" isOpen={true} size="md">
      <ModalContent>
        <>
          <ModalHeader className="flex flex-col gap-1 bg-black">
            <>
              <h2 className="text-justify text-white">Login</h2>
              <p className="text-justify text-white text-[0.8rem]">
                Please login to continue
              </p>
            </>
          </ModalHeader>
          <ModalBody>
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2 my-2">
                <Input
                  label="Email"
                  labelPlacement="outside"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  className="self-center my-2 sm:w-1/2 lg:w-2/5"
                  isDisabled={!email}
                  type="submit"
                  variant="ghost"
                >
                  {loading ? <Spinner color="current" size="sm" /> : null}
                  <FaEnvelope />
                  Send Login Link
                </Button>
              </div>
            </form>
            <div className="flex items-center ">
              <div className="flex-grow border-t border-gray-300" />
              <span className="mx-4 text-gray-500">or</span>
              <div className="flex-grow border-t border-gray-300" />
            </div>
            <div className="flex flex-col gap-2 my-2">
              <Button
                className="self-center sm:w-1/2 lg:w-2/5"
                type="submit"
                variant="ghost"
                onClick={() => handleSignIn('google')}
              >
                <FaGoogle /> Login With Google
              </Button>
              <Button
                className="self-center sm:w-1/2 lg:w-2/5"
                type="submit"
                variant="ghost"
                onClick={() => handleSignIn('facebook')}
              >
                <FaFacebookF /> Login With Facebook
              </Button>
            </div>
          </ModalBody>
          <ModalFooter className="border-t border-gray-300">
            <Button
              color="danger"
              size="sm"
              variant="ghost"
              onPress={() => router.push('/')}
            >
              Cancel
            </Button>
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  )
}

export default LoginForm
