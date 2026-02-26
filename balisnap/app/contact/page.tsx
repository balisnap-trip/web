'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Input, Spinner, Textarea } from '@heroui/react'
import { Button } from '@heroui/react'
import { ToastContainer } from 'react-toastify'

import 'react-toastify/dist/ReactToastify.css'

import { title } from '@/components/primitives'
import { toastr } from '@/lib/utils/toast/toast'

const HeroInput = Input as unknown as React.ComponentType<any>
const HeroTextarea = Textarea as unknown as React.ComponentType<any>
const HeroButton = Button as unknown as React.ComponentType<any>
const HeroSpinner = Spinner as unknown as React.ComponentType<any>

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  })

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)
  const [erroEmail, setErroEmail] = useState(false)

  const validateEmail = (value: string) =>
    /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target

    setFormData({ ...formData, [name]: value })

    // Validate inputs
    if (name === 'email') {
      setErrors({
        ...errors,
        email: validateEmail(value) ? '' : 'Please enter a valid email'
      })
    } else if (name === 'name' || name === 'message') {
      setErrors({
        ...errors,
        [name]: value.trim() === '' ? 'This field is required' : ''
      })
    }
  }

  const validateForm = () => {
    const newErrors = {
      name: formData.name.trim() === '' ? 'This field is required' : '',
      email:
        formData.email.trim() === ''
          ? 'This field is required'
          : !validateEmail(formData.email)
            ? 'Please enter a valid email'
            : '',
      message: formData.message.trim() === '' ? 'This field is required' : ''
    }

    setErrors(newErrors)

    return !Object.values(newErrors).some((error) => error)
  }

  useEffect(() => {
    if (!loading && !erroEmail) {
      resetForm()
    }
  }, [loading, erroEmail])

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      email: '',
      message: ''
    })
    setErrors({
      name: '',
      email: '',
      message: ''
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) {
      alert('Please fill out all fields correctly.')

      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/mail/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (response.status === 200) {
        setLoading(false)
        setErroEmail(false)
        toastr('Email sent successfully', 'success')
      } else {
        setErroEmail(true)
        setLoading(false)
        toastr('Error sending email, please try again', 'error')
      }
    } catch (error) {
      console.log(error)
    }
  }

  const isButtonDisabled = () => {
    return (
      Object.values(formData).some((value) => value.trim() === '') ||
      Object.values(errors).some((error) => error)
    )
  }

  return (
    <div className="max-w-screen-xl px-4 py-8 mx-auto bg-white shadow-lg">
      <ToastContainer />
      <h1 className={title()}>Contact Us</h1>
      <div className="my-8 text-sm font-bold leading-relaxed text-gray-600">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <HeroInput
              required
              color={errors.name ? 'danger' : 'default'}
              label="Name"
              name="name"
              placeholder="Enter your name"
              radius="md"
              type="text"
              value={formData.name}
              onChange={handleChange}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name}</p>
            )}
          </div>
          <div className="mb-4">
            <HeroInput
              required
              color={errors.email ? 'danger' : 'default'}
              label="Email"
              name="email"
              placeholder="Enter your email"
              radius="md"
              type="email"
              value={formData.email}
              onChange={handleChange}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-500">{errors.email}</p>
            )}
          </div>
          <div className="mb-4">
            <HeroTextarea
              required
              color={errors.message ? 'danger' : 'default'}
              label="Message"
              name="message"
              placeholder="Enter your message"
              radius="md"
              value={formData.message}
              onChange={handleChange}
            />
            {errors.message && (
              <p className="mt-1 text-sm text-red-500">{errors.message}</p>
            )}
          </div>
          <div className="flex justify-center">
            <HeroButton
              color="success"
              isDisabled={isButtonDisabled()}
              radius="md"
              size="lg"
              type="submit"
            >
              {loading ? <HeroSpinner color="white" size="sm" /> : null}
              Send
            </HeroButton>
          </div>
        </form>
      </div>
    </div>
  )
}
