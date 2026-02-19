import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader
} from '@heroui/react'
import { useRouter } from 'next/navigation'
import { FaInfoCircle } from 'react-icons/fa'

const VerifyRequest = () => {
  const router = useRouter()

  return (
    <Modal hideCloseButton backdrop="blur" isOpen={true} size="md">
      <ModalContent>
        <>
          <ModalHeader className="flex flex-col gap-1 bg-black">
            <>
              <h2 className="text-justify text-white">Verify your email</h2>
            </>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col items-center justify-center">
              <p>
                A Magic Link has been sent to your email. Please click on the
                link to verify your email.
              </p>
              <br />
              <p className="flex flex-row items-center gap-1 text-sm">
                <FaInfoCircle className="text-orange-500" size={30} />{' '}
                <i>
                  **If you did not receive the email, please check your spam
                  folder.
                </i>
              </p>
            </div>
          </ModalBody>
          <ModalFooter className="border-t border-gray-300">
            <Button
              color="danger"
              size="sm"
              variant="ghost"
              onPress={() => router.push('/')}
            >
              OK
            </Button>
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  )
}

export default VerifyRequest
