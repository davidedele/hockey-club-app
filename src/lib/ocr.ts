// Reads the words out of a photo, on the phone itself.
//
// The picture never leaves the device: the only thing fetched from outside is the reading engine
// and its Italian language file, which carry nothing of the member. The engine is large, so it is
// only fetched the first time somebody reads a certificate, and never when the app starts.
export async function readText(image: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('ita')
  try {
    const out = await worker.recognize(image)
    return out.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}
