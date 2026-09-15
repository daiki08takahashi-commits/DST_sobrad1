import { useLocation, useNavigate } from 'react-router-dom';
import { BreatheIcon, CloseIcon, EmergencyIcon, PhoneIcon } from '../components/icons.jsx';

export default function Emergency() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from || '/home';

  return (
    <div className="screen-inner">
      <div className="emergency-header">
        <div className="emergency-header-top">
          <span className="eyebrow">Emergency help</span>
          <button
            className="emergency-close"
            onClick={() => navigate(returnTo)}
            aria-label="Close and return"
          >
            <CloseIcon />
          </button>
        </div>
        <EmergencyIcon className="emergency-icon" />
        <h1>You&rsquo;re not alone right now</h1>
      </div>

      <div className="emergency-body">
        <a className="btn btn-primary btn-danger" href="tel:988">
          <PhoneIcon />
          Call or text 988
        </a>
        <p className="emergency-sub">
          Free and confidential, available 24/7 across the US and Canada.
        </p>

        <button className="btn btn-outline" onClick={() => navigate('/breathing')}>
          <BreatheIcon />
          Start a grounding exercise
        </button>

        <p className="emergency-line">
          Whatever brought you here, you don&rsquo;t have to carry it alone. Someone is ready to
          listen, whenever you&rsquo;re ready to talk.
        </p>
      </div>
    </div>
  );
}
