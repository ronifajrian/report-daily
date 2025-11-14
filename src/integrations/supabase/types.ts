// src/types/supabase.merged.ts
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
  __InternalSupabase?: {
    PostgrestVersion?: "13.0.5"
  }
  public: {
    Tables: {
      daily_reports: {
        Row: {
          id: string
          user_id: string
          description: string
          file_url: string | null
          file_name: string | null
          // stricter union from original types.ts (recommended). If your DB uses other values, change to string.
          status: 'pending' | 'approved' | 'rejected'
          approved_by: string | null
          approved_at: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          id?: string
          user_id: string
          description: string
          file_url?: string | null
          file_name?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          description?: string
          file_url?: string | null
          file_name?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne?: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne?: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          created_at: string
          updated_at: string
          department: string | null
          email: string | null
          phone: string | null
          status: string | null
        }
        Insert: {
          id: string
          full_name: string
          created_at?: string
          updated_at?: string
          department?: string | null
          email?: string | null
          phone?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          created_at?: string
          updated_at?: string
          department?: string | null
          email?: string | null
          phone?: string | null
          status?: string | null
        }
        Relationships: []
      }
      report_audit_logs: {
        Row: {
          id: string
          report_id: string
          user_id: string | null
          action: string
          previous_status: string | null
          new_status: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id?: string | null
          action: string
          previous_status?: string | null
          new_status?: string | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string | null
          action?: string
          previous_status?: string | null
          new_status?: string | null
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_audit_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne?: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne?: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          id: string
          report_id: string
          user_id: string
          comment_text: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          comment_text: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string
          comment_text?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne?: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne?: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_files: {
        Row: {
          id: string
          report_id: string
          file_url: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          created_at: string
          storage_path: string
        }
        Insert: {
          id?: string
          report_id: string
          file_url?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          created_at?: string
          storage_path?: string
        }
        Update: {
          id?: string
          report_id?: string
          file_url?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          created_at?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_files_report_id_fkey"
            columns: ["report_id"]
            isOneToOne?: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_views: {
        Row: {
          id: string
          report_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne?: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          key: string
          value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          key: string
          value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'system_settings_updated_by_fkey';
            columns: ['updated_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "staff" | "approver" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["staff", "approver", "admin"],
    },
  },
} as const


