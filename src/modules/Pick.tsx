import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { MODULES } from '../components/AppShell';
import { Empty } from '../components/ui';
import { Icon } from '../components/Icon';

/** Shown when a module is opened before any inspection has been chosen. */
export function Pick() {
  const { module } = useParams();
  const { inspections } = useStore();
  const mod = MODULES.find((m) => m.id === module);
  const active = inspections.filter((i) => !i.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className={mod?.cls}>
      <div className="module-head">
        <div className="module-icon">
          <Icon name={mod?.icon ?? 'home'} />
        </div>
        <div>
          <h1>{mod?.label ?? 'Module'}</h1>
          <p>Choose the inspection to work on.</p>
        </div>
      </div>
      <section className="panel">
        {active.length === 0 ? (
          <Empty icon="mission">
            No inspections yet. <Link to="/new">Create one</Link> or load the demo from the <Link to="/">dashboard</Link>.
          </Empty>
        ) : (
          <ul className="list">
            {active.map((i) => (
              <li key={i.id}>
                <Link to={`/i/${i.id}/${module}`} className="row between card-link">
                  <span>
                    <strong>{i.claimNumber}</strong> · {i.title}
                  </span>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
