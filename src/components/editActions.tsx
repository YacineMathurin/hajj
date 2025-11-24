'use client'
import React from 'react'
import { useDocumentInfo, SaveButton } from '@payloadcms/ui'

const EditActions: React.FC<any> = (props) => {
  const { id } = useDocumentInfo()

  const handleDownloadFiche = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (id) {
      window.open(`/api/clients/generate-pdf/${id}`, '_blank')
    }
  }

  return (
    <>
      {/* Render original save button */}
      <SaveButton {...props} />

      {/* Add separator */}
      {id && (
        <div
          style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 0.5rem' }}
        />
      )}

      {/* Your custom buttons */}
      {id && (
        <>
          <button
            type="button"
            onClick={handleDownloadFiche}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
            }}
          >
            📄 Imprimer la fiche
          </button>
        </>
      )}
    </>
  )
}

export default EditActions
