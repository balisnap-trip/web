// pages/404.tsx
import React from 'react'
import Link from 'next/link'

const NoContentPage = () => {
  return (
    <div className="h-[60vh] flex flex-col justify-center items-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">204</h1>
      <h2 className="text-2xl text-gray-600 mb-6">No Content</h2>
      <p className="text-gray-500 mb-8">
        No content was found for the requested URL.
      </p>
      <Link
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        href="/"
      >
        Go back home
      </Link>
    </div>
  )
}

export default NoContentPage
