import { Card, CardBody, CardFooter, Checkbox, Link } from '@heroui/react'

import { useForm } from '@/providers/FormProvider'

const Confirm = () => {
  const {
    tourData,
    totalPrice,
    formData,
    formattedDate,
    handleChangeCheckBox
  } = useForm()

  const highlights = tourData?.Highlights
    ? tourData.Highlights.map((highlight: any) => highlight.description)
    : []

  return (
    <div className="w-full">
      <Card className="p-[0.5rem] h-auto" radius="none">
        <CardBody className="p-0">
          <div className="flex flex-col">
            <div className="w-full pb-2 text-gray-600 border-b border-gray-200">
              <div className="mb-1 font-bold">Tour Information</div>
              <div className="w-full py-2 font-bold">
                {tourData.package_name}
              </div>
              <div className="w-full text-xs">
                {highlights && (
                  <>
                    <div className="w-full text-sm font-bold">Highlights</div>
                    <ul className="text-sm text-gray-700">
                      {highlights.map((item: any, index: number) => (
                        <li
                          key={`additional-${index}`}
                          className="flex items-start mb-1"
                        >
                          <span className="text-start text-[0.8rem]">
                            - {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
            <div className="w-full mt-2 font-bold text-gray-600">
              Booking Information
            </div>
            <h3 className="pt-2 pb-0 font-bold text-large">{tourData.title}</h3>
            <div className="flex items-center justify-between w-full py-1">
              <span className="text-xs font-bold text-gray-600">Date</span>
              <span className="text-xs text-gray-600">{formattedDate}</span>
            </div>
            <div className="flex w-full justify-between items-center pb-[0.2rem]">
              <span className="text-xs font-bold text-gray-600">
                Participant
              </span>
              <span className="text-xs text-gray-600">
                {`Adults: ${formData.adult}, Children: ${formData.children}`}
              </span>
            </div>
            <div className="flex w-full justify-between items-center pb-[0.2rem]">
              <span className="text-xs font-bold text-gray-600">
                Contact Name
              </span>
              <span className="text-xs text-gray-600">
                {formData.tourLeader}
              </span>
            </div>
            <div className="flex w-full justify-between items-center pb-[0.2rem]">
              <span className="text-xs font-bold text-gray-600">
                Contact Email
              </span>
              <span className="text-xs text-gray-600">
                {formData.tourLeaderEmail}
              </span>
            </div>
            <div className="flex w-full justify-between items-center pb-[0.2rem]">
              <span className="text-xs font-bold text-gray-600">
                Contact Phone
              </span>
              <span className="text-xs text-gray-600">
                {formData.tourLeaderPhone}
              </span>
            </div>
            <div className="flex w-full justify-between items-center pb-[0.2rem]">
              <span className="text-xs font-bold text-gray-600">Pick Up</span>
              <span className="text-xs text-gray-600">
                {formData.pickupLocation}
              </span>
            </div>
          </div>
        </CardBody>
        <CardFooter className="flex flex-col items-start p-2 mt-2 border-t border-gray-200">
          <div className="w-full px-0">
            <div className="w-full font-bold text-gray-600">
              Additional notes
            </div>
            {formData.message && (
              <p className="text-xs text-gray-600">{formData.message}</p>
            )}
            <hr className="my-2" />
          </div>
          <div className="flex items-center justify-between w-full">
            {totalPrice && (
              <span className="flex items-baseline space-x-1">
                <span className="text-sm font-bold text-gray-600">Total</span>
                <span className="text-[1.3rem] font-bold text-green-600">
                  {`${totalPrice} USD`}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between w-full mt-2">
            <Checkbox
              isSelected={formData.agreement}
              name="agreement"
              size="sm"
              onChange={handleChangeCheckBox}
            >
              I have reviewed the booking details and agree to the{' '}
              <Link
                className="text-[0.85rem]"
                href="/terms-of-service"
                target="_blank"
              >
                Terms of Service
              </Link>
              .
            </Checkbox>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

export default Confirm
