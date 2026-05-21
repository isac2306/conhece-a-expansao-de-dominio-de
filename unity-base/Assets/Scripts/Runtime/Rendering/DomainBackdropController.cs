using UnityEngine;

namespace UnlimitedVoid.UnityBase.Rendering
{
    [RequireComponent(typeof(Renderer))]
    public sealed class DomainBackdropController : MonoBehaviour
    {
        [SerializeField] private Renderer targetRenderer;
        [SerializeField] private float durationSeconds = 4.2f;
        [SerializeField] private Color tintA = new Color(0.03f, 0.09f, 0.16f, 1f);
        [SerializeField] private Color tintB = new Color(0.31f, 0.72f, 1.0f, 1f);
        [SerializeField] private Color tintC = new Color(1.0f, 0.93f, 0.72f, 1f);
        [SerializeField] private AnimationCurve activationCurve = null;

        private Material _runtimeMaterial;
        private float _startedAt = -999f;
        private Vector2 _domainCenter = new Vector2(0.5f, 0.45f);

        public bool IsRunning => Time.time - _startedAt < durationSeconds;

        private void Awake()
        {
            if (targetRenderer == null)
            {
                targetRenderer = GetComponent<Renderer>();
            }

            if (activationCurve == null)
            {
                activationCurve = AnimationCurve.EaseInOut(0f, 0f, 1f, 1f);
            }

            if (targetRenderer != null && targetRenderer.sharedMaterial != null)
            {
                _runtimeMaterial = new Material(targetRenderer.sharedMaterial);
                targetRenderer.material = _runtimeMaterial;
                ApplyIdleState();
            }
        }

        private void Update()
        {
            if (_runtimeMaterial == null)
            {
                return;
            }

            var elapsed = Time.time - _startedAt;
            var normalized = Mathf.Clamp01(elapsed / durationSeconds);
            var activation = IsRunning ? activationCurve.Evaluate(normalized) : 0f;

            _runtimeMaterial.SetFloat("_Activation", activation);
            _runtimeMaterial.SetFloat("_TimeOffset", Time.time);
            _runtimeMaterial.SetVector("_DomainCenter", new Vector4(_domainCenter.x, _domainCenter.y, 0f, 0f));
            _runtimeMaterial.SetColor("_TintA", tintA);
            _runtimeMaterial.SetColor("_TintB", tintB);
            _runtimeMaterial.SetColor("_TintC", tintC);
        }

        public void BeginActivation(Vector2 centerNormalized)
        {
            _domainCenter = centerNormalized;
            _startedAt = Time.time;
        }

        private void ApplyIdleState()
        {
            _runtimeMaterial.SetFloat("_Activation", 0f);
            _runtimeMaterial.SetFloat("_TimeOffset", 0f);
            _runtimeMaterial.SetVector("_DomainCenter", new Vector4(_domainCenter.x, _domainCenter.y, 0f, 0f));
            _runtimeMaterial.SetColor("_TintA", tintA);
            _runtimeMaterial.SetColor("_TintB", tintB);
            _runtimeMaterial.SetColor("_TintC", tintC);
        }
    }
}
