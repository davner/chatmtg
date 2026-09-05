import { createRoot } from 'react-dom/client'
import { Preview, type PreviewData } from './Preview.tsx'

declare global {
  interface Window {
    __CHATMTG__: PreviewData
  }
}

createRoot(document.getElementById('root')!).render(<Preview data={window.__CHATMTG__} />)
