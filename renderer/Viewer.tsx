import ReactDOM from 'react-dom/client';
import ViewerApp from './pages/_viewer';

const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(<ViewerApp />);
} else {
  console.error('Viewer: #root not found');
}
