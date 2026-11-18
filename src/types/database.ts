export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      daily_picks: {
        Row: {
          picked_on: string
          video_id: string
        }
        Insert: {
          picked_on: string
          video_id: string
        }
        Update: {
          picked_on?: string
          video_id?: string
        }
        Relationships: []
      }
      filter_settings: {
        Row: {
          blocked_keywords: string[]
          exclude_live: boolean
          id: number
          min_duration_seconds: number
          updated_at: string
        }
        Insert: {
          blocked_keywords?: string[]
          exclude_live?: boolean
          id?: number
          min_duration_seconds?: number
          updated_at?: string
        }
        Update: {
          blocked_keywords?: string[]
          exclude_live?: boolean
          id?: number
          min_duration_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      managed_playlists: {
        Row: {
          created_at: string
          key: string
          title: string
          youtube_playlist_id: string
        }
        Insert: {
          created_at?: string
          key: string
          title: string
          youtube_playlist_id: string
        }
        Update: {
          created_at?: string
          key?: string
          title?: string
          youtube_playlist_id?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          origin: string
          subscribed: boolean
          thumbnail_url: string | null
          title: string
          topic_slug: string | null
          youtube_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          origin?: string
          subscribed?: boolean
          thumbnail_url?: string | null
          title: string
          topic_slug?: string | null
          youtube_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          origin?: string
          subscribed?: boolean
          thumbnail_url?: string | null
          title?: string
          topic_slug?: string | null
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          quota_used: number | null
          started_at: string
          status: string
          summary: Json | null
          trigger: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: never
          quota_used?: number | null
          started_at?: string
          status?: string
          summary?: Json | null
          trigger: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: never
          quota_used?: number | null
          started_at?: string
          status?: string
          summary?: Json | null
          trigger?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          allow_live_recordings: boolean
          allowed_keywords: string[]
          extra_blocked_keywords: string[]
          min_duration_seconds: number | null
          name: string
          slug: string
          sort: number
        }
        Insert: {
          allow_live_recordings?: boolean
          allowed_keywords?: string[]
          extra_blocked_keywords?: string[]
          min_duration_seconds?: number | null
          name: string
          slug: string
          sort?: number
        }
        Update: {
          allow_live_recordings?: boolean
          allowed_keywords?: string[]
          extra_blocked_keywords?: string[]
          min_duration_seconds?: number | null
          name?: string
          slug?: string
          sort?: number
        }
        Relationships: []
      }
      videos: {
        Row: {
          duration_seconds: number | null
          fetched_at: string
          live_status: string
          published_at: string
          series_position: number | null
          source_id: string
          thumbnail_url: string | null
          title: string
          was_live: boolean
          youtube_id: string
        }
        Insert: {
          duration_seconds?: number | null
          fetched_at?: string
          live_status?: string
          published_at: string
          series_position?: number | null
          source_id: string
          thumbnail_url?: string | null
          title: string
          was_live?: boolean
          youtube_id: string
        }
        Update: {
          duration_seconds?: number | null
          fetched_at?: string
          live_status?: string
          published_at?: string
          series_position?: number | null
          source_id?: string
          thumbnail_url?: string | null
          title?: string
          was_live?: boolean
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
