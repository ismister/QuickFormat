import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import OutputTypeModal from './OutputTypeModal';

function App() {
  // --- Состояния ---
  const [ffmpegInstance, setFfmpegInstance] = useState(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const [inputFile, setInputFile] = useState(null);
  const [inputFileName, setInputFileName] = useState('INPUT FILE NAME');
  const [selectedInputType, setSelectedInputType] = useState(null); // Тип входного файла (из расширения)

  const [outputFile, setOutputFile] = useState(null);
  const [outputFileName, setOutputFileName] = useState('OUTPUT FILE NAME');
  const [selectedOutputType, setSelectedOutputType] = useState(null); // Тип выходного (с десктопа или модалки)

  const [isConverting, setIsConverting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [conversionProgress, setConversionProgress] = useState(0);
  const [eta, setEta] = useState("--:--:--");
  const [showProgressBar, setShowProgressBar] = useState(false);

  const [isOutputTypeModalOpen, setIsOutputTypeModalOpen] = useState(false); // Для модалки

  // --- Рефы ---
  const totalDurationRef = useRef(0);
  const conversionStartTimeRef = useRef(0);
  const fileInputRef = useRef(null);

  // --- Константы ---
  const fileTypes = ["MP3", "M4A", "MP4", "WAV", "OGG", "AVI"];

  // --- Вспомогательные функции (showError, getMimeType, parseTimeToSeconds, formatEta) ---
  const showError = useCallback((message) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage('');
    }, 7000);
  }, []);

  const getMimeType = (format) => {
    const formatLower = format.toLowerCase();
    switch (formatLower) {
      case 'mp3': return 'audio/mpeg';
      case 'm4a': return 'audio/mp4';
      case 'mp4': return 'video/mp4';
      case 'wav': return 'audio/wav';
      case 'ogg': return 'audio/ogg';
      case 'avi': return 'video/x-msvideo';
      default: return 'application/octet-stream';
    }
  };
  const parseTimeToSeconds = (logMessage) => {
    const timeMatch = logMessage.match(/time=(\d{2,}):(\d{2}):(\d{2}\.\d+)/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseFloat(timeMatch[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  };
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
      if (ffmpegLoaded || ffmpegInstance) return;
      console.log('Попытка инициализации и загрузки FFmpeg v0.12...');
      const ffmpeg = new FFmpeg(); // Создаем экземпляр локально

      if (typeof ffmpeg.on === 'function') {
        ffmpeg.on('log', ({ type, message }) => {
          console.log(`[FFMPEG LOG][${type}]: ${message}`);
          if (type === 'stderr') {
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
            const currentTimeInSeconds = parseTimeToSeconds(message);
            if (currentTimeInSeconds !== null && totalDurationRef.current > 0) {
              let progress = (currentTimeInSeconds / totalDurationRef.current) * 100;
              progress = Math.min(100, Math.max(0, progress));
              setConversionProgress(progress);
              const elapsedTimeSeconds = (performance.now() - conversionStartTimeRef.current) / 1000;
              if (progress > 0.1 && elapsedTimeSeconds > 0.1) {
                const totalEstimatedTimeSeconds = elapsedTimeSeconds / (progress / 100);
                const remainingTimeSeconds = totalEstimatedTimeSeconds - elapsedTimeSeconds;
                setEta(formatEta(remainingTimeSeconds));
              }
            } else if (message.includes("Lsize") || message.startsWith("video:")) {
                if (totalDurationRef.current > 0) {
                    setConversionProgress(100);
                    setEta(formatEta(0));
                }
            }
          }
        });
        console.log('Подписка на событие "log" FFmpeg установлена.');
      } else {
        console.warn('Метод .on() для логов не найден.');
      }

      try {
        let proxyWorkerURL = new URL(import.meta.env.BASE_URL + 'ffmpeg_proxy/worker.js', window.location.origin).href;
        
        const baseAppPath = import.meta.env.BASE_URL;
        const baseURL = window.location.origin;
        const coreJsURL = new URL(baseAppPath + 'ffmpeg-core.js', baseURL).href;
        const coreWasmURL = new URL(baseAppPath + 'ffmpeg-core.wasm', baseURL).href;
        const coreWorkerJsURL = new URL(baseAppPath + 'ffmpeg-core.worker.js', baseURL).href;

        console.log('Параметры для ffmpeg.load():');
        console.log('  classWorkerURL:', proxyWorkerURL);
        console.log('  coreOptions.coreURL:', coreJsURL);
        console.log('  coreOptions.wasmURL:', coreWasmURL);
        console.log('  coreOptions.workerURL:', coreWorkerJsURL);

        await ffmpeg.load({
          classWorkerURL: proxyWorkerURL,
          coreOptions: {
            coreURL: coreJsURL,
            wasmURL: coreWasmURL,
            workerURL: coreWorkerJsURL
          }
        });

        if (ffmpeg.loaded) {
          setFfmpegInstance(ffmpeg);
          setFfmpegLoaded(true);
          console.log("Экземпляр FFmpeg успешно загружен!");
        } else {
          showError("FFmpeg .load() завершился, но .loaded=false.");
        }
      } catch (error) {
        console.error("Критическая ошибка при загрузке FFmpeg:", error);
        showError(`Ошибка загрузки FFmpeg: ${error.message || 'Неизвестная ошибка.'}`);
      }
    };
    loadFFmpeg();
  }, [ffmpegLoaded, ffmpegInstance, showError]);

  const isConvertButtonActuallyDisabled = !inputFile || isConverting;

  // --- Обработчики ---
  const handleInputBoxClick = () => { // Для верхнего квадрата (загрузка входного файла)
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => { // После выбора входного файла из проводника
    const file = event.target.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        showError("Файл слишком большой! Максимум 100 МБ.");
        setInputFile(null); setInputFileName('INPUT FILE NAME'); setSelectedInputType(null);
        if(fileInputRef.current) fileInputRef.current.value = null;
        return;
      }
      const fileExtension = file.name.split('.').pop().toUpperCase();
      if (!fileTypes.map(ft => ft.toUpperCase()).includes(fileExtension)) {
          showError(`Неподдерживаемый тип входного файла: .${fileExtension}`);
          setInputFile(null); setInputFileName('INPUT FILE NAME'); setSelectedInputType(null);
          if(fileInputRef.current) fileInputRef.current.value = null;
          return;
      }
      setInputFile(file);
      setInputFileName(file.name);
      setSelectedInputType(fileExtension); // Устанавливаем тип ВХОДНОГО файла
      setOutputFile(null); // Сброс предыдущего результата
      setOutputFileName('OUTPUT FILE NAME');
      setSelectedOutputType(null); // Сбрасываем выбранный ранее выходной тип
    }
  };

  const handleConvertButtonPress = () => {
    if (!inputFile || !selectedInputType) {
      showError("Сначала выберите входной файл.");
      return;
    }
    // По новой мобильной логике, мы всегда открываем модалку для выбора выходного типа
    // На десктопе, если selectedOutputType уже выбран через боковую панель, можно было бы сразу запускать.
    // Для унификации пока всегда будем открывать модалку, если selectedOutputType не задан.
    // Если selectedOutputType УЖЕ задан (например, на десктопе), то запускаем конвертацию.
    if (selectedOutputType) {
        startActualConversionProcess(selectedOutputType);
    } else {
        setIsOutputTypeModalOpen(true);
    }
  };

  // Вызывается из модального окна после выбора выходного типа
  const handleOutputTypeSelectedFromModal = (outputType) => {
    setIsOutputTypeModalOpen(false);
    startActualConversionProcess(outputType.toUpperCase());
  };

  // Основная логика конвертации, теперь отдельная функция
  const startActualConversionProcess = async (finalOutputType) => {
    if (!ffmpegInstance || !ffmpegLoaded) { showError("Модуль FFmpeg не загружен."); return; }
    if (!inputFile) { showError("Входной файл не выбран."); return; }
    if (!finalOutputType) { showError("Выходной тип не выбран."); return; }

    setSelectedOutputType(finalOutputType); // Устанавливаем окончательный выходной тип

    setIsConverting(true);
    setShowProgressBar(true);
    setConversionProgress(0);
    setEta("--:--:--");
    totalDurationRef.current = 0;
    // outputFile и outputFileName сбрасываются при выборе нового inputFile

    const inputFileNameInFS = inputFile.name;
    const outputFormat = finalOutputType.toLowerCase();
    const outputFileNameInFS = `output_conv.${outputFormat}`;

    try {
      await ffmpegInstance.writeFile(inputFileNameInFS, await fetchFile(inputFile));
      console.log(`Файл ${inputFileNameInFS} записан в MEMFS.`);
      conversionStartTimeRef.current = performance.now();

      const command = ['-i', inputFileNameInFS];
      const audioBitrate = '192k';
      const isInputVideo = ['MP4', 'AVI', 'MOV', 'MKV', 'FLV', 'WEBM'].includes(selectedInputType.toUpperCase());

      switch (outputFormat) {
        case 'mp3': command.push('-c:a', 'libmp3lame', '-b:a', audioBitrate); break;
        case 'm4a': case 'aac': command.push('-c:a', 'aac', '-b:a', audioBitrate); break;
        case 'wav': break;
        case 'ogg': command.push('-c:a', 'libvorbis', '-q:a', '4'); break;
        case 'mp4':
            if (isInputVideo) {
                command.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', audioBitrate);
            } else { command.push('-c:a', 'aac', '-b:a', audioBitrate); }
            break;
        case 'avi':
            if (isInputVideo) {
                command.push('-c:v', 'mpeg4', '-qscale:v', '4', '-c:a', 'libmp3lame', '-b:a', audioBitrate);
            } else { command.push('-c:a', 'libmp3lame', '-b:a', audioBitrate); }
            break;
        default: console.warn(`Формат для команды не опознан: ${outputFormat}`);
      }
      command.push(outputFileNameInFS);

      console.log('FFmpeg command for exec:', command.join(' '));
      await ffmpegInstance.exec(command);

      if (totalDurationRef.current > 0 && conversionProgress < 99.9) {
          setConversionProgress(100); setEta(formatEta(0));
      } else if (totalDurationRef.current === 0 && conversionProgress === 0) {
          setConversionProgress(100); setEta(formatEta(0));
      }

      const outputData = await ffmpegInstance.readFile(outputFileNameInFS);
      if (outputData.length === 0) throw new Error("Выходной файл пуст.");
      
      const mimeType = getMimeType(outputFormat);
      const blob = new Blob([outputData.buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setOutputFile(url);
      const originalNameWithoutExtension = inputFileNameInFS.substring(0, inputFileNameInFS.lastIndexOf('.')) || inputFileNameInFS;
      setOutputFileName(`converted_${originalNameWithoutExtension}.${outputFormat}`);
      console.log("Конвертация успешно завершена.");

    } catch (error) {
      console.error("Ошибка во время конвертации:", error);
      showError(`Ошибка конвертации: ${error.message || 'Неизвестная ошибка'}`);
      setShowProgressBar(false); // Скрываем шкалу при ошибке
    } finally {
      try {
        if (ffmpegInstance && ffmpegInstance.deleteFile) {
          await ffmpegInstance.deleteFile(inputFileNameInFS);
          await ffmpegInstance.deleteFile(outputFileNameInFS);
        }
      } catch (e) { console.error("Ошибка очистки MEMFS:", e); }
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
  const getAcceptAttribute = () => "audio/*,video/*"; // Упрощено для мобильных

  // Логика для отображения квадрата скачивания
  const isOutputBoxActuallyDisabled = !outputFile || isConverting;

  return (
    <div className="app-container">
      {/* Шкала прогресса и ETA */}
      {showProgressBar && (
        <div className="progress-bar-section"> {/* Новый контейнер для позиционирования */}
          <div className="progress-bar-container">
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${conversionProgress}%` }}
              ></div>
            </div>
          </div>
          <div className="progress-labels-container"> {/* Контейнер для меток под шкалой */}
            <span className="progress-percentage">{`${Math.round(conversionProgress)}%`}</span>
            <span className="progress-eta">{eta}</span>
          </div>
        </div>
      )}

      {/* Основной UI */}
      <div className="main-controls"> {/* Новый контейнер для мобильной раскладки */}
        <div
          className="file-handler-box input-box" // Добавлен класс для специфичных стилей
          onClick={handleInputBoxClick}
        >
          <span className="arrow">▲</span>
          <div className="file-name">{inputFileName || 'input file name'}</div>
          <input
            type="file" ref={fileInputRef} style={{ display: 'none' }}
            onChange={handleFileChange} accept={getAcceptAttribute()}
          />
        </div>

        <button
          className="convert-button"
          onClick={handleConvertButtonPress}
          disabled={isConvertButtonActuallyDisabled}
          style={{ opacity: isConvertButtonActuallyDisabled ? 0.5 : 1.0 }}
        >
          {isConverting ? 'КОНВЕРТАЦИЯ...' : 'CONVERT'}
        </button>

        <div
          className={`file-handler-box output-box ${isOutputBoxActuallyDisabled ? 'disabled' : ''}`}
          onClick={!isOutputBoxActuallyDisabled ? handleDownload : undefined}
        >
          <span className="arrow">▼</span>
          <div className="file-name">{outputFileName}</div>
        </div>
      </div> {/* Конец .main-controls */}


      {/* Модальное окно */}
      <OutputTypeModal
        isOpen={isOutputTypeModalOpen}
        onClose={() => setIsOutputTypeModalOpen(false)}
        fileTypes={fileTypes}
        onSelectOutputType={handleOutputTypeSelectedFromModal}
        disabledType={selectedInputType} // Передаем тип ВХОДНОГО файла для блокировки
      />

      {/* Сообщение об ошибке */}
      {errorMessage && (
        <div className="error-message-wrapper"> {/* Обертка для позиционирования */}
            <div className={`error-message ${errorMessage ? 'visible' : ''}`}>
            {errorMessage}
            </div>
        </div>
      )}
    </div>
  );
}

export default App;