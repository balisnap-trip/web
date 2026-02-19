import { getLocalTimeZone, today, toZoned } from '@internationalized/date'
import { DatePicker, Input } from '@heroui/react'

import { useForm } from '@/providers/FormProvider'

const FormStep1 = () => {
  const { totalPrice, handleChange, handleChangeDate, formData, tourData } =
    useForm()

  // DatePicker expects a DateValue (ZonedDateTime). Convert CalendarDate to ZonedDateTime.
  const defaultCal = today(getLocalTimeZone()).add({ days: 2 })
  const minCal = today(getLocalTimeZone()).add({ days: 1 })
  const defaultDateValue = toZoned(defaultCal, getLocalTimeZone())
  const minDateValue = toZoned(minCal, getLocalTimeZone())
  const valueDateValue = formData.date
    ? toZoned(formData.date, getLocalTimeZone())
    : undefined

  return (
    <>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <DatePicker
          isRequired
          className="w-full"
          defaultValue={defaultDateValue}
          label={`Date`}
          labelPlacement="outside"
          minValue={minDateValue}
          name="date"
          value={valueDateValue}
          onChange={handleChangeDate}
        />
      </div>
      <div className="flex flex-wrap w-full gap-4 md:flex-nowrap">
        <Input
          isRequired
          className="w-full"
          label="Adults"
          labelPlacement="outside"
          min={tourData.min_booking || 2}
          name="adult"
          placeholder="2"
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="number"
          value={formData.adult.toString()}
          onChange={handleChange}
        />
        <Input
          className="w-full"
          label="Children"
          labelPlacement="outside"
          min={0}
          name="children"
          placeholder="1"
          startContent={
            <div className="flex items-center pointer-events-none">
              <span className="text-default-400 text-small" />
            </div>
          }
          type="number"
          value={formData.children.toString()}
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-wrap w-full gap-2 md:flex-nowrap">
        <p className="text-lg font-bold text-black-700">Total:</p>
        <p className="text-lg font-bold text-green-700">${totalPrice} USD</p>
      </div>
    </>
  )
}

export default FormStep1
