Shader "UnlimitedVoid/Foreground Composite"
{
    Properties
    {
        _CameraTex ("Camera Texture", 2D) = "black" {}
        _MaskTex ("Mask Texture", 2D) = "white" {}
        _HasMask ("Has Mask", Float) = 0
        _FlipX ("Flip X", Float) = 1
        _Opacity ("Opacity", Range(0, 1)) = 1
    }

    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            sampler2D _CameraTex;
            sampler2D _MaskTex;
            float _HasMask;
            float _FlipX;
            float _Opacity;

            v2f vert(appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 uv = i.uv;
                if (_FlipX > 0.5)
                {
                    uv.x = 1 - uv.x;
                }

                fixed4 cameraColor = tex2D(_CameraTex, uv);
                float alpha = 1;

                if (_HasMask > 0.5)
                {
                    float mask = tex2D(_MaskTex, uv).r;
                    alpha = smoothstep(0.35, 0.75, mask);
                }

                cameraColor.a = alpha * _Opacity;
                return cameraColor;
            }
            ENDCG
        }
    }
}
