import React from 'react';
import './OutputTypeModal.css';

function OutputTypeModal({
  isOpen,
  onClose,
  fileTypes,
  onSelectOutputType,
  disabledType, // Тип входного файла, который нужно заблокировать
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}> {/* Закрытие по клику на оверлей */}
      <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Предотвращаем закрытие по клику на сам контент */}
        <h2>Choose Output Type</h2> {/* Ваш заголовок из макета */}
        <p>Please, tap on wanted type of media.</p> {/* Ваш подзаголовок */}
        <div className="modal-types-list">
          {fileTypes.map((type) => {
            const isOutputDisabled = type.toUpperCase() === disabledType?.toUpperCase();
            return (
              <button
                key={type}
                className={`modal-type-button ${isOutputDisabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (!isOutputDisabled) {
                    onSelectOutputType(type);
                  }
                }}
                disabled={isOutputDisabled}
              >
                {type}
              </button>
            );
          })}
        </div>
        <button className="modal-cancel-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default OutputTypeModal;