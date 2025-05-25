import React, { useState, useEffect, useRef } from 'react';
import './App.css';
// import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'; // Подключим позже

// const ffmpeg = createFFmpeg({ log: true }); // Инициализация ffmpeg, позже

function App() {
  const [inputFile, setInputFile] = useState(null);
  const [outputFile, setOutputFile] = useState(null); // Будет содержать URL для скачивания
  const [inputFileName, setInputFileName] = useState('');
  const [outputFileName, setOutputFileName] = useState('OUTPUT FILE NAME');

  const [selectedInputType, setSelectedInputType] = useState(null);
  const [selectedOutputType, setSelectedOutputType] = useState(null);

  const [isConverting, setIsConverting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef(null); // Для триггера клика по input[type=file]

  const fileTypes = ["MP3", "M4A", "MP4", "WAV", "AAC", "AVI"];

  // --- Логика состояний кнопки CONVERT ---
  const getConvertButtonOpacity = () => {
    if (!selectedInputType) return 0.5;
    if (selectedInputType && !inputFile) return 0.6;
    if (selectedInputType && inputFile && !selectedOutputType) return 0.9;
    return 1.0; // Все условия выполнены
  };

  const isConvertButtonDisabled = getConvertButtonOpacity() < 1.0;
  const isOutputBoxDisabled = !outputFile || isConverting;

  // --- Обработчики ---
  const handleInputTypeSelect = (type) => {
    setSelectedInputType(type);
    if (type === selectedOutputType) {
      setSelectedOutputType(null); // Сброс, если типы совпадают
    }
  };

  const handleOutputTypeSelect = (type) => {
    if (type !== selectedInputType) {
      setSelectedOutputType(type);
    }
  };

  const handleInputBoxClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click(); // Открываем диалог выбора файла
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) { // 100 MB limit
        showError("Файл слишком большой! Максимум 100 МБ.");
        setInputFile(null);
        setInputFileName('');
        event.target.value = null; // Сброс значения инпута
        return;
      }
      // Проверка типа файла (базовая)
      const fileExtension = file.name.split('.').pop().toUpperCase();
      if (selectedInputType && fileExtension !== selectedInputType && !(selectedInputType === 'MP4' && fileExtension === 'MOV')) { // просто пример
        // Более сложная проверка MIME-типа будет надежнее
        showError(`Неверный тип файла. Ожидается ${selectedInputType}.`);
        setInputFile(null);
        setInputFileName('');
        event.target.value = null;
        return;
      }

      setInputFile(file);
      setInputFileName(file.name);
      setOutputFile(null); // Сбрасываем предыдущий результат, если был
      setOutputFileName('OUTPUT FILE NAME');
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault(); // Необходимо для работы onDrop
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      // Повторяем логику из handleFileChange
      if (file.size > 100 * 1024 * 1024) {
        showError("Файл слишком большой! Максимум 100 МБ.");
        return;
      }
      const fileExtension = file.name.split('.').pop().toUpperCase();
      if (selectedInputType && fileExtension !== selectedInputType) {
         showError(`Неверный тип файла. Ожидается ${selectedInputType}.`);
         return;
      }
      setInputFile(file);
      setInputFileName(file.name);
      setOutputFile(null);
      setOutputFileName('OUTPUT FILE NAME');
    }
  };


  const handleConvert = async () => {
    if (!inputFile || !selectedInputType || !selectedOutputType) {
      showError("Пожалуйста, выберите входной файл, тип входного и выходного файла.");
      return;
    }
    setIsConverting(true);
    setOutputFile(null); // Очищаем предыдущий результат
    showError(''); // Скрываем предыдущие ошибки

    // --- Здесь будет логика конвертации с ffmpeg.wasm ---
    console.log(`Конвертация ${inputFile.name} из ${selectedInputType} в ${selectedOutputType}`);
    // Имитация конвертации
    setTimeout(() => {
      // Предположим, что конвертация успешна и мы получили blob
      const mockOutputBlob = new Blob(["Это фейковый сконвертированный файл"], { type: 'text/plain' });
      const url = URL.createObjectURL(mockOutputBlob);
      setOutputFile(url);
      setOutputFileName(`converted_${inputFile.name.split('.')[0]}.${selectedOutputType.toLowerCase()}`);
      setIsConverting(false);
    }, 3000); // Задержка для имитации
  };

  const handleDownload = () => {
    if (outputFile) {
      const a = document.createElement('a');
      a.href = outputFile;
      a.download = outputFileName || `converted_file.${selectedOutputType.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(outputFile); // Освобождаем память
    }
  };

  const showError = (message) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage('');
    }, 5000); // Ошибка исчезает через 5 секунд
  };

  // --- Подготовка `accept` атрибута для input file ---
  const getAcceptAttribute = () => {
    if (!selectedInputType) return "*/*"; // Все файлы, если тип не выбран
    switch (selectedInputType) {
      case "MP3": return ".mp3,audio/mpeg";
      case "M4A": return ".m4a,audio/mp4";
      case "MP4": return ".mp4,video/mp4";
      case "WAV": return ".wav,audio/wav";
      case "AAC": return ".aac,audio/aac";
      case "AVI": return ".avi,video/x-msvideo";
      default: return "*/*";
    }
  };


  return (
    <div className="app-container">
      <button
        className="convert-button"
        onClick={handleConvert}
        disabled={isConvertButtonDisabled || isConverting}
        style={{ opacity: isConverting ? 0.5 : getConvertButtonOpacity() }}
      >
        {isConverting ? 'КОНВЕРТАЦИЯ...' : 'CONVERT'}
      </button>

      <div className="converter-ui">
        {/* Левый селектор типов */}
        <div className="type-selector">
          {fileTypes.map(type => (
            <div
              key={type}
              className={`${selectedInputType === type ? 'selected' : ''}`}
              onClick={() => handleInputTypeSelect(type)}
            >
              {type}
            </div>
          ))}
        </div>

        {/* Квадрат для загрузки */}
        <div
          className={`file-handler-box ${!selectedInputType ? 'disabled': ''}`}
          onClick={!selectedInputType ? undefined : handleInputBoxClick}
          onDragOver={handleDragOver}
          onDrop={!selectedInputType ? undefined : handleDrop}
        >
          <span className="arrow">▲</span> {/* Можно заменить на SVG иконку */}
          <div className="file-name">{inputFileName || 'INPUT FILE NAME'}</div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept={getAcceptAttribute()}
            disabled={!selectedInputType}
          />
        </div>

        {/* Анимация загрузки */}
        {isConverting && (
          <div className="loading-indicator">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        )}
        {/* Заглушка, если не идет конвертация, чтобы сохранить место */}
        {!isConverting && <div style={{width: '65px', height: '200px' /* ширина точек + gap */}}></div> }


        {/* Квадрат для скачивания */}
        <div
          className={`file-handler-box ${isOutputBoxDisabled ? 'disabled' : ''}`}
          onClick={!isOutputBoxDisabled ? handleDownload : undefined}
        >
          <span className="arrow">▼</span> {/* Можно заменить на SVG иконку */}
          <div className="file-name">{outputFileName}</div>
        </div>

        {/* Правый селектор типов */}
        <div className="type-selector">
          {fileTypes.map(type => (
            <div
              key={type}
              className={`${selectedOutputType === type ? 'selected' : ''} ${selectedInputType === type ? 'disabled' : ''}`}
              onClick={() => selectedInputType !== type && handleOutputTypeSelect(type)}
            >
              {type}
            </div>
          ))}
        </div>
      </div>

      {/* Окно ошибки */}
      {errorMessage && (
        <div className={`error-message ${errorMessage ? 'visible' : ''}`}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export default App;
