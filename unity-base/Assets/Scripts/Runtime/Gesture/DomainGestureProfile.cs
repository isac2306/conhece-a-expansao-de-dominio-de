using System;

namespace UnlimitedVoid.UnityBase.Gesture
{
    [Serializable]
    public sealed class DomainGestureProfile
    {
        public float IndexExtension = 0.30f;
        public float MiddleExtension = 0.30f;
        public float TipGap = 0.42f;
        public float CrossAngle = 22f;
        public float RingCurl = 0.04f;
        public float PinkyCurl = 0.05f;

        public DomainGestureProfile Clone()
        {
            return new DomainGestureProfile
            {
                IndexExtension = IndexExtension,
                MiddleExtension = MiddleExtension,
                TipGap = TipGap,
                CrossAngle = CrossAngle,
                RingCurl = RingCurl,
                PinkyCurl = PinkyCurl,
            };
        }
    }
}
