import {
  CalendarDate,
  getLocalTimeZone,
  today,
  ZonedDateTime
} from '@internationalized/date'
import { useSession } from 'next-auth/react'
import React, {
  createContext,
  useState,
  useContext,
  ChangeEvent,
  useMemo,
  ReactNode,
  useEffect
} from 'react'

interface FormData {
  date: CalendarDate
  adult: number
  children: number
  tourLeader: string
  tourLeaderEmail: string
  tourLeaderPhone: string
  message: string
  pickupLocation: string
  agreement: boolean
}

interface FormErrors {
  date?: string
  adult?: string
  children?: string
  tourLeader?: string
  tourLeaderEmail?: string
  tourLeaderPhone?: string
  pickupLocation?: string
  agreement?: string
}

interface FormContextValue {
  currentForm: string
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  formErrors: FormErrors
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleChangeDate: (date: CalendarDate | ZonedDateTime | null) => void
  handleChangeCheckBox: (e: ChangeEvent<HTMLInputElement>) => void
  handleNext: () => void
  handlePrevious: () => void
  totalPrice: number
  tourData: any // Replace `any` with a more specific type if possible
  formattedDate: string
}

const FormContext = createContext<FormContextValue | null>(null)

interface FormProviderProps {
  children: ReactNode
  tourData?: {
    tour: string
    price_per_person: number
    price_per_child: number | null
    min_booking: number | null
    max_booking: number | null
  }
}

const FormProvider: React.FC<FormProviderProps> = ({ children, tourData }) => {
  const { data: session } = useSession()
  const [currentForm, setCurrentForm] = useState('form1')
  const [formData, setFormData] = useState<FormData>({
    date: today(getLocalTimeZone()).add({ days: 2 }),
    adult: tourData?.min_booking ?? 2,
    children: 0,
    tourLeader: session?.user?.name || '',
    tourLeaderEmail: session?.user?.email || '',
    tourLeaderPhone: '',
    message: '',
    pickupLocation: '',
    agreement: false
  })

  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const validate = (): FormErrors => {
    const newErrors: FormErrors = {}
    const minBooking = tourData?.min_booking ?? 2

    if (!formData.date || formData.date <= today(getLocalTimeZone())) {
      newErrors.date = 'Date is required and must be in the future'
    }
    if (formData.adult < minBooking) {
      newErrors.adult = `At least ${minBooking} adults is required`
    }
    if (formData.children < 0) {
      newErrors.children = 'Children cannot be negative'
    }
    if (!formData.tourLeader) {
      newErrors.tourLeader = 'Tour Leader is required'
    }
    if (
      !formData.tourLeaderEmail ||
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(
        formData.tourLeaderEmail
      )
    ) {
      newErrors.tourLeaderEmail = 'Valid email is required'
    }
    if (
      !formData.tourLeaderPhone ||
      !/^\+?(\d{1,3})?\d{10,15}$/.test(formData.tourLeaderPhone)
    ) {
      newErrors.tourLeaderPhone = 'Valid phone number is required'
    }
    if (!formData.pickupLocation) {
      newErrors.pickupLocation = 'Pickup location is required'
    }
    if (!formData.agreement) {
      newErrors.agreement = 'You must agree to the terms'
    }

    return newErrors
  }

  useEffect(() => {
    setFormErrors(validate())
  }, [formData])

  // Memoized adult price calculation with discount
  const adultPrice = useMemo(() => {
    if (!tourData?.price_per_person) return 0

    const baseAdultPrice = tourData.price_per_person * formData.adult

    // Apply a 10% discount if the number of adults exceeds maxBooking
    if (
      typeof tourData.max_booking === 'number' &&
      formData.adult > tourData.max_booking
    ) {
      return baseAdultPrice * 0.9 // 10% discount
    }

    return baseAdultPrice
  }, [formData.adult, tourData?.price_per_person])

  // Memoized child price calculation
  const childPrice = useMemo(() => {
    if (!tourData) return 0

    // Jika price_per_child ada, gunakan itu untuk perhitungan
    if (
      tourData.price_per_child !== null &&
      tourData.price_per_child !== undefined
    ) {
      return tourData.price_per_child * formData.children
    }

    // Jika price_per_child tidak ada, gunakan price_per_person untuk menghitung harga anak
    if (tourData.price_per_person) {
      return (tourData.price_per_person / 2) * formData.children
    }

    return 0 // Jika tourData atau harga tidak ada, kembalikan 0
  }, [formData.children, tourData?.price_per_person, tourData?.price_per_child])

  // Memoized total price calculation
  const totalPrice = useMemo(
    () => adultPrice + childPrice,
    [adultPrice, childPrice]
  )

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target

    setFormData((prevData) => ({
      ...prevData,
      [name]: name === 'adult' || name === 'children' ? Number(value) : value
    }))
  }

  const handleChangeCheckBox = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target

    setFormData((prevData) => ({
      ...prevData,
      [name]: checked
    }))
  }

  const handleChangeDate = (date: CalendarDate | ZonedDateTime | null) => {
    if (!date) return // optional: set default

    // If the picker supplies a ZonedDateTime, convert to CalendarDate before storing
    if ('timeZone' in date) {
      const z = date as ZonedDateTime
      const cal: CalendarDate = {
        year: z.year,
        month: z.month,
        day: z.day
        // internal CalendarDate nominal typing is okay at runtime; cast to any to satisfy TS
      } as any

      setFormData((prevData) => ({
        ...prevData,
        date: cal
      }))

      return
    }

    // Otherwise assume CalendarDate
    setFormData((prevData) => ({
      ...prevData,
      date: date as CalendarDate
    }))
  }

  const handleNext = () => {
    setCurrentForm((prevForm) => {
      if (prevForm === 'form1') return 'form2'
      if (prevForm === 'form2') return 'confirm'
      if (prevForm === 'confirm') return 'checkout'

      return prevForm
    })
  }

  const handlePrevious = () => {
    setCurrentForm((prevForm) => {
      if (prevForm === 'form2') return 'form1'
      if (prevForm === 'confirm') return 'form2'
      if (prevForm === 'checkout') return 'confirm'

      return prevForm
    })
  }

  const date = new Date(
    formData.date.year,
    formData.date.month - 1,
    formData.date.day
  )

  // Define locale and options for formatting
  const locale = 'en-US' // Adjust locale as needed
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long', // Optional: include weekday in the output
    timeZone: 'Asia/Makassar'
  }

  // Create a formatter and format the date
  const dateFormatter = new Intl.DateTimeFormat(locale, options)
  const formattedDate = dateFormatter.format(date)

  return (
    <FormContext.Provider
      value={{
        currentForm,
        formData,
        setFormData,
        formErrors,
        handleChange,
        handleChangeCheckBox,
        handleChangeDate,
        handleNext,
        handlePrevious,
        totalPrice,
        tourData,
        formattedDate
      }}
    >
      {children}
    </FormContext.Provider>
  )
}

export const useForm = () => {
  const context = useContext(FormContext)

  if (!context) {
    throw new Error('useForm must be used within a FormProvider')
  }

  return context
}

export default FormProvider
