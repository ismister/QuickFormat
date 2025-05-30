import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg;

function App() {
  const [ffmpegInstance, setFfmpegInstance] = useState(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const [inputFile, setInputFile] = useState(null);
  const [outputFile, setOutputFile] = useState(null); // Будет содержать URL для скачивания
  const [inputFileName, setInputFileName] = useState('');
  const [outputFileName, setOutputFileName] = useState('OUTPUT FILE NAME');

  const [selectedInputType, setSelectedInputType] = useState(null);
  const [selectedOutputType, setSelectedOutputType] = useState(null);

  const [isConverting, setIsConverting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [conversionProgress, setConversionProgress] = useState(0); // От 0 до 100
  const [eta, setEta] = useState("--:--:--"); // Estimated Time Remaining
  const [showProgressBar, setShowProgressBar] = useState(false); // Видимость шкалы

  const totalDurationRef = useRef(0); // Для хранения общей длительности текущего файла (в секундах)
  const conversionStartTimeRef = useRef(0); // Для хранения времени начала текущей конвертации
  const fileInputRef = useRef(null); // Для триггера клика по input[type=file]

  const fileTypes = ["MP3", "M4A", "MP4", "WAV", "OGG", "AVI"];

  // --- Вспомогательные функции ---

  /**
   * Функция для отображения сообщений об ошибках.
   * @param {string} message - Сообщение об ошибке.
   */
  const showError = (message) => {
    setErrorMessage(message);
    // Опционально: скрывать сообщение через некоторое время
    setTimeout(() => {
      setErrorMessage('');
    }, 7000); // Ошибка будет видна 7 секунд
  };

  /**
   * Функция для определения MIME-типа по расширению файла.
   * @param {string} format - Расширение файла (например, 'mp3', 'mp4').
   * @returns {string} - MIME-тип.
   */
  const getMimeType = (format) => {
    const formatLower = format.toLowerCase();
    switch (formatLower) {
      case 'mp3': return 'audio/mpeg';
      case 'm4a': return 'audio/mp4'; // M4A - это контейнер MP4 для аудио
      case 'mp4': return 'video/mp4';
      case 'wav': return 'audio/wav';
      case 'ogg': return 'audio/ogg'; 
      case 'avi': return 'video/x-msvideo';
      default: return 'application/octet-stream'; // Общий тип по умолчанию
    }
  };


  /**
     * Парсит строку лога FFmpeg для извлечения текущего времени обработки.
     * @param {string} logMessage - Строка лога.
     * @returns {number|null} Время в секундах или null.
     */
    const parseTimeToSeconds = (logMessage) => {
    // Ищем паттерн time=HH:MM:SS.ms (или time= SSSS.ms)
    const timeMatch = logMessage.match(/time=(\d{2,}):(\d{2}):(\d{2}\.\d+)/); // Для HH:MM:SS.ms
    if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        return hours * 3600 + minutes * 60 + seconds;
    }
    // Можно добавить обработку для просто секунд, если формат лога меняется
    // const simpleTimeMatch = logMessage.match(/time=(\d+\.\d+)/);
    // if (simpleTimeMatch) {
    //   return parseFloat(simpleTimeMatch[1]);
    // }
    return null;
    };

    /**
     * Форматирует оставшееся время в строку -HH:MM:SS.
     * @param {number} totalSeconds - Общее количество секунд.
     * @returns {string} - Отформатированная строка времени.
     */
    const formatEta = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0 || !isFinite(totalSeconds)) {
    return "- --:--:--";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (num) => String(num).padStart(2, '0');
    return `-${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    };

  // --- useEffect для загрузки FFmpeg ---
  useEffect(() => {
    const loadFFmpeg = async () => {
      // Предотвращаем повторную загрузку, если уже загружено или экземпляр существует
      if (ffmpegLoaded || ffmpegInstance) {
        console.log('FFmpeg уже загружен или экземпляр существует.');
        return;
      }

      console.log('Попытка инициализации и загрузки FFmpeg v0.12...');
      const ffmpeg = new FFmpeg(); // Создаем экземпляр из @ffmpeg/ffmpeg

      if (typeof ffmpeg.on === 'function') {
        ffmpeg.on('log', ({ type, message }) => {
            console.log(`[FFMPEG LOG][${type}]: ${message}`);
        if (type === 'stderr') { // И длительность, и прогресс теперь из stderr от exec
            // 1. Пытаемся извлечь общую длительность, если она еще не установлена
            if (totalDurationRef.current === 0) {
              const durationMatch = message.match(/Duration: (\d{2,}):(\d{2}):(\d{2}\.\d+)/);
              if (durationMatch) {
                const hours = parseInt(durationMatch[1], 10);
                const minutes = parseInt(durationMatch[2], 10);
                const seconds = parseFloat(durationMatch[3]);
                totalDurationRef.current = hours * 3600 + minutes * 60 + seconds;
                console.log(`Общая длительность файла (из лога exec): ${totalDurationRef.current} секунд.`);
              }
            }

            // 2. Пытаемся извлечь текущее время для прогресса
            const currentTimeInSeconds = parseTimeToSeconds(message);
            if (currentTimeInSeconds !== null && totalDurationRef.current > 0) {
              let progress = (currentTimeInSeconds / totalDurationRef.current) * 100;
              progress = Math.min(100, Math.max(0, progress));
              setConversionProgress(progress);

              const elapsedTimeSeconds = (performance.now() - conversionStartTimeRef.current) / 1000;
              if (progress > 0.1 && elapsedTimeSeconds > 0.1) { // Начинаем считать ETA чуть позже
                const totalEstimatedTimeSeconds = elapsedTimeSeconds / (progress / 100);
                const remainingTimeSeconds = totalEstimatedTimeSeconds - elapsedTimeSeconds;
                setEta(formatEta(remainingTimeSeconds));
              }
            } else if (message.includes("Lsize") || message.startsWith("video: समय")) { // "время" - это если локаль FFmpeg вдруг станет русской для "time"
                 // Lsize обычно означает конец успешной конвертации
                 console.log('FFmpeg конвертация завершена (судя по Lsize или video:). Устанавливаем 100%');
                if (totalDurationRef.current > 0) { // Убедимся, что длительность была определена
                    setConversionProgress(100);
                    setEta(formatEta(0));
                }
            }
          }
        });
        console.log('Подписка на событие "log" FFmpeg установлена.');
      } else {
        console.warn('Метод .on() для логов не найден на экземпляре FFmpeg.');
      }

      try {
        let proxyWorkerURL;
        try {
          proxyWorkerURL = new URL(import.meta.env.BASE_URL + 'ffmpeg_proxy/worker.js', window.location.origin).href;
          console.log('URL для прокси-воркера FFmpeg (через import.meta.url):', proxyWorkerURL);
        } catch (e) {
          console.error('Не удалось создать URL для прокси-воркера через import.meta.url:', e);
          showError('Критическая ошибка: не удалось определить путь к прокси-воркеру FFmpeg.');
          return; // Прерываем загрузку
        }


        const baseAppPath = import.meta.env.BASE_URL; // '/QuickFormat/'


        // URL для файлов ядра FFmpeg (которые должны лежать в public/)
        const baseURL = window.location.origin; // например, http://localhost:5173
        const coreJsURL = new URL(baseAppPath + 'ffmpeg-core.js', window.location.origin).href;
        const coreWasmURL = new URL(baseAppPath + 'ffmpeg-core.wasm', window.location.origin).href;
        const coreWorkerJsURL = new URL(baseAppPath + 'ffmpeg-core.worker.js', baseURL).href; // <--- ВАЖНО! Путь к воркеру ядра


        console.log('Параметры для ffmpeg.load():');
        console.log('  classWorkerURL:', proxyWorkerURL);
        console.log('  coreOptions.coreURL:', coreJsURL);
        console.log('  coreOptions.wasmURL:', coreWasmURL);
        console.log('  coreOptions.workerURL:', coreWorkerJsURL);

        await ffmpeg.load({
          classWorkerURL: proxyWorkerURL, // Путь к "прокси" воркеру из @ffmpeg/ffmpeg
          coreOptions: {
            coreURL: coreJsURL,         // Путь к ffmpeg-core.js (из @ffmpeg/core) в public/
            wasmURL: coreWasmURL,       // Путь к ffmpeg-core.wasm (из @ffmpeg/core) в public/
            workerURL: coreWorkerJsURL    // Путь к ffmpeg-core.worker.js (из @ffmpeg/core) в public/
          } 
        });

        if (ffmpeg.loaded) {
          setFfmpegInstance(ffmpeg);
          setFfmpegLoaded(true);
          console.log("Экземпляр FFmpeg v0.12 успешно загружен и готов к работе!");
        } else {
          console.error("ffmpeg.load() завершился, но свойство .loaded осталось false.");
          showError("Не удалось корректно загрузить модуль FFmpeg (свойство loaded=false).");
        }

      } catch (error) {
        console.error("Критическая ошибка при загрузке экземпляра FFmpeg v0.12:", error);
        // Вывод полного объекта ошибки может помочь в отладке
        console.dir(error);
        showError(`Ошибка загрузки FFmpeg: ${error.message || 'Неизвестная ошибка. Проверьте консоль.'}`);
      }
    };

    loadFFmpeg();
  }, []); // Пустой массив зависимостей [], чтобы useEffect выполнился один раз после монтирования компонента

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
    if (!ffmpegInstance || !ffmpegLoaded) {
        showError("Модуль конвертации еще не загружен. Пожалуйста, подождите.");
        return;
    }
    if (!inputFile) {
        showError("Пожалуйста, загрузите входной файл.");
        return;
    }
    if (!selectedOutputType) {
        showError("Пожалуйста, выберите тип выходного файла.");
        return;
    }

    setIsConverting(true);
    setShowProgressBar(true); // Показываем шкалу
    setConversionProgress(0); // Сброс прогресса
    setEta("--:--:--");       // Сброс ETA
    totalDurationRef.current = 0; // Сброс общей длительности
    setOutputFile(null);
    setOutputFileName('OUTPUT FILE NAME');
    showError('');

    const inputFileNameInFS = inputFile.name;
    const outputFormat = selectedOutputType.toLowerCase();
    const outputFileNameInFS = `output_conv.${outputFormat}`;

    try {
        // 1. Записываем входной файл в виртуальную файловую систему FFmpeg
        // ИЗМЕНЕНИЕ: используем ffmpegInstance.writeFile() напрямую
        const fileData = await fetchFile(inputFile); // fetchFile возвращает Uint8Array
        await ffmpegInstance.writeFile(inputFileNameInFS, fileData);
        console.log(`Файл ${inputFileNameInFS} записан в MEMFS.`);

        conversionStartTimeRef.current = performance.now();

        // 2. Формируем команду для FFmpeg
        const command = ['-i', inputFileNameInFS];
        const audioBitrate = '192k';
        const inputExtension = inputFileNameInFS.split('.').pop().toLowerCase();
        const isInputPotentiallyVideo = ['mp4', 'avi', 'mov', 'mkv', 'flv', 'webm'].includes(inputExtension);

        switch (outputFormat) {
            case 'mp3':
                command.push('-c:a', 'libmp3lame', '-b:a', audioBitrate);
                break;
            case 'm4a':
            case 'aac':
                command.push('-c:a', 'aac', '-b:a', audioBitrate);
                break;
            case 'wav':
                // Для WAV обычно не нужны специфичные кодеки
                break;
            case 'mp4':
                if (isInputPotentiallyVideo) {
                    command.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', audioBitrate);
                } else {
                    command.push('-c:a', 'aac', '-b:a', audioBitrate);
                }
                break;
            case 'avi':
                if (isInputPotentiallyVideo) {
                    command.push('-c:v', 'mpeg4', '-qscale:v', '4', '-c:a', 'libmp3lame', '-b:a', audioBitrate);
                } else {
                    command.push('-c:a', 'libmp3lame', '-b:a', audioBitrate);
                }
                break;
            default:
                console.warn(`Неизвестный выходной формат для команд: ${outputFormat}`);
        }
        command.push(outputFileNameInFS);

        console.log('FFmpeg command for exec:', command.join(' '));

        // 3. Запускаем команду FFmpeg (используя .exec())
        const result = await ffmpegInstance.exec(command);
        console.log("Результат выполнения ffmpeg.exec (если есть):", result);
        // Если exec не выбросил ошибку, и мы дошли сюда, значит команда формально выполнилась.
        // Теперь нужно проверить, что файл действительно создан и имеет ненулевой размер.

        if (conversionProgress < 100 && totalDurationRef.current > 0) { // Если вдруг не дошло до 100
          setConversionProgress(100);
          setEta(formatEta(0));
        }

        // 4. Читаем сконвертированный файл из виртуальной файловой системы
        // ИЗМЕНЕНИЕ: используем ffmpegInstance.readFile() напрямую
        // readFile возвращает Uint8Array, если кодировка 'binary' (по умолчанию)
        const outputData = await ffmpegInstance.readFile(outputFileNameInFS);
        console.log(`Прочитан выходной файл ${outputFileNameInFS} из MEMFS, размер: ${outputData.length} байт.`);

        if (outputData.length === 0) {
            showError("Ошибка конвертации: выходной файл пуст. Проверьте команду FFmpeg и логи.");
            return; // Прерываем, если файл пуст
        }

        setConversionProgress(100); // Устанавливаем 100% по завершению
        setEta("- 00:00:00"); // ETA завершено

        // 5. Создаем URL для скачивания файла
        const mimeType = getMimeType(outputFormat);
        const blob = new Blob([outputData.buffer], { type: mimeType }); // outputData это Uint8Array, его .buffer это ArrayBuffer
        const url = URL.createObjectURL(blob);

        setOutputFile(url);
        const originalNameWithoutExtension = inputFileNameInFS.substring(0, inputFileNameInFS.lastIndexOf('.')) || inputFileNameInFS;
        setOutputFileName(`converted_${originalNameWithoutExtension}.${outputFormat}`);
        console.log("Конвертация успешно завершена, файл готов к скачиванию.");

    } catch (error) {
        console.error("Ошибка во время конвертации (в блоке try...catch):", error);
        let detailedErrorMessage = "Произошла ошибка во время конвертации.";
        if (error && typeof error.message === 'string') {
            detailedErrorMessage += ` (${error.message})`;
        } else if (typeof error === 'string') {
            detailedErrorMessage += ` (${error})`;
        }
        console.log("Полный объект ошибки:", error); // Для детального изучения ошибки
        showError(detailedErrorMessage);
    } finally {
        // 6. Очищаем файлы из виртуальной файловой системы FFmpeg
        // ИЗМЕНЕНИЕ: используем ffmpegInstance.deleteFile() напрямую
        try {
            if (ffmpegInstance && ffmpegInstance.deleteFile) { // Проверяем наличие метода
                console.log(`Попытка удалить ${inputFileNameInFS} из MEMFS...`);
                await ffmpegInstance.deleteFile(inputFileNameInFS);
                console.log(`Файл ${inputFileNameInFS} удален.`);

                console.log(`Попытка удалить ${outputFileNameInFS} из MEMFS...`);
                await ffmpegInstance.deleteFile(outputFileNameInFS);
                console.log(`Файл ${outputFileNameInFS} удален.`);
            }
        } catch (cleanupError) {
            console.error("Ошибка при очистке файлов FFmpeg FS:", cleanupError);
        }
        setIsConverting(false);
    }
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
      setShowProgressBar(false); 
    }
  };
  

  // --- Подготовка `accept` атрибута для input file ---
  const getAcceptAttribute = () => {
    if (!selectedInputType) return "*/*"; // Все файлы, если тип не выбран
    switch (selectedInputType) {
      case "MP3": return ".mp3,audio/mpeg";
      case "M4A": return ".m4a,audio/mp4";
      case "MP4": return ".mp4,video/mp4";
      case "WAV": return ".wav,audio/wav";
      case "OGG": return ".ogg,audio/ogg";
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
        {isConverting ? 'CONVERTATION...' : 'CONVERT'}
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

        {/* Шкала прогресса конвертации */}
        {showProgressBar && (
        <div className="progress-bar-container">
            <div className="progress-labels">
            <span className="progress-percentage">{`${Math.round(conversionProgress)}%`}</span>
            <span className="progress-eta">{eta}</span>
            </div>
            <div className="progress-bar-track">
            <div
                className="progress-bar-fill"
                style={{ width: `${conversionProgress}%` }}
            ></div>
            </div>
        </div>
        )}

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
