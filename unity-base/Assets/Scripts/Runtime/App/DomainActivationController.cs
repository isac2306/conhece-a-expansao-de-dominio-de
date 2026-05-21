using UnityEngine;
using UnityEngine.Events;
using UnlimitedVoid.UnityBase.Rendering;

namespace UnlimitedVoid.UnityBase.App
{
    public sealed class DomainActivationController : MonoBehaviour
    {
        [SerializeField] private DomainBackdropController backdropController;
        [SerializeField] private AudioSource activationAudio;
        [SerializeField] private ParticleSystem activationParticles;
        [SerializeField] private float cooldownSeconds = 5.2f;
        [SerializeField] private UnityEvent onActivated;

        private float _nextAllowedAt;

        public bool IsCoolingDown => Time.time < _nextAllowedAt;

        public bool TryActivate(Vector2 centerNormalized)
        {
            if (IsCoolingDown)
            {
                return false;
            }

            _nextAllowedAt = Time.time + cooldownSeconds;

            if (backdropController != null)
            {
                backdropController.BeginActivation(centerNormalized);
            }

            if (activationAudio != null)
            {
                activationAudio.Play();
            }

            if (activationParticles != null)
            {
                activationParticles.Play(true);
            }

            onActivated?.Invoke();
            return true;
        }
    }
}
