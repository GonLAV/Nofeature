import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
}

export default function Card({ children, className = '', title }: CardProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
      {children}
    </div>
  )
}
