import { Input, Textarea } from '@heroui/react'
import PhoneInput from 'react-phone-input-2'

import { useForm } from '@/providers/FormProvider'
import 'react-phone-input-2/lib/style.css'
const FormStep2 = () => {
  const { handleChange, formData, totalPrice, setFormData } = useForm()

  const handleChangePhone = (value: string) => {
    setFormData({ ...formData, tourLeaderPhone: value })
  }

  return (
    <>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Input
          isRequired
          className="w-full"
          label="Main contact name"
          labelPlacement="outside"
          name="tourLeader"
          placeholder="John Doe"
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="text"
          value={formData.tourLeader}
          onChange={handleChange}
        />
      </div>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Input
          isRequired
          className="w-full"
          label="Main contact email"
          labelPlacement="outside"
          name="tourLeaderEmail"
          placeholder="example@mail.com"
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="email"
          value={formData.tourLeaderEmail}
          onChange={handleChange}
        />
      </div>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Input
          isRequired
          label="Phone Number"
          labelPlacement="outside"
          name="tourLeaderPhone"
          placeholder="+6281xxxxxxxx"
          type="tel"
          value={formData.tourLeaderPhone}
          onChange={handleChange}
          style={{ display: 'none' }}
          // Disable interactions on Input field if PhoneInput is used for styling
          startContent={
            <div
              style={{
                position: 'relative',
                zIndex: 10000
              }}
            >
              <PhoneInput
                country={'us'}
                enableSearch
                value={formData.tourLeaderPhone}
                onChange={handleChangePhone}
                inputStyle={{
                  border: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: 'inherit'
                }}
                buttonStyle={{
                  border: 'none',
                  backgroundColor: 'inherit'
                }}
              />
            </div>
          }
        />
      </div>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Input
          isRequired
          className="w-full"
          label="Pickup Location"
          labelPlacement="outside"
          name="pickupLocation"
          placeholder="Hotel, Airport, etc."
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="text"
          value={formData.pickupLocation}
          onChange={handleChange}
        />
      </div>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Textarea
          className="w-full"
          label="Notes"
          labelPlacement="outside"
          name="message"
          placeholder="Put any additional notes here"
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="text"
          value={formData.message}
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-wrap w-full gap-2 md:flex-nowrap">
        <p className="text-lg font-bold text-black-700">Total:</p>{' '}
        <p className="text-lg font-bold text-green-700">${totalPrice} USD</p>
      </div>
    </>
  )
}

export default FormStep2
