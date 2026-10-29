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
      audit_logs: {
        Row: {
          action: string
          action_type: string
          actor_id: string | null
          actor_name: string
          actor_role: string
          after_state: Json | null
          before_state: Json | null
          cipher: string | null
          details: string
          entity: string
          entity_id: string
          id: string
          integrity_hash: string
          ip_address: unknown
          previous_hash: string
          raw_timestamp: string
          severity: string
        }
        Insert: {
          action: string
          action_type: string
          actor_id?: string | null
          actor_name: string
          actor_role: string
          after_state?: Json | null
          before_state?: Json | null
          cipher?: string | null
          details: string
          entity: string
          entity_id: string
          id?: string
          integrity_hash: string
          ip_address?: unknown
          previous_hash: string
          raw_timestamp?: string
          severity: string
        }
        Update: {
          action?: string
          action_type?: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          after_state?: Json | null
          before_state?: Json | null
          cipher?: string | null
          details?: string
          entity?: string
          entity_id?: string
          id?: string
          integrity_hash?: string
          ip_address?: unknown
          previous_hash?: string
          raw_timestamp?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      colegiados_normas: {
        Row: {
          created_at: string | null
          descriptor: string | null
          fecha: string
          file_download: string | null
          id: string
          numero: string
          organo: string
          organo_code: string
          resumen: string | null
          signatarios: string | null
          tipo: string
          titulo: string
          vigencia: string | null
          year: string
        }
        Insert: {
          created_at?: string | null
          descriptor?: string | null
          fecha: string
          file_download?: string | null
          id: string
          numero: string
          organo: string
          organo_code: string
          resumen?: string | null
          signatarios?: string | null
          tipo: string
          titulo: string
          vigencia?: string | null
          year: string
        }
        Update: {
          created_at?: string | null
          descriptor?: string | null
          fecha?: string
          file_download?: string | null
          id?: string
          numero?: string
          organo?: string
          organo_code?: string
          resumen?: string | null
          signatarios?: string | null
          tipo?: string
          titulo?: string
          vigencia?: string | null
          year?: string
        }
        Relationships: []
      }
      convenios: {
        Row: {
          archivo_minuta: string | null
          created_at: string | null
          cuantia: string | null
          entidad: string
          estado: string | null
          fin: string
          id: string
          inicio: string
          numero: string
          objeto: string
          supervisor: string | null
          tipo: string
          tipo_label: string
        }
        Insert: {
          archivo_minuta?: string | null
          created_at?: string | null
          cuantia?: string | null
          entidad: string
          estado?: string | null
          fin: string
          id: string
          inicio: string
          numero: string
          objeto: string
          supervisor?: string | null
          tipo: string
          tipo_label: string
        }
        Update: {
          archivo_minuta?: string | null
          created_at?: string | null
          cuantia?: string | null
          entidad?: string
          estado?: string | null
          fin?: string
          id?: string
          inicio?: string
          numero?: string
          objeto?: string
          supervisor?: string | null
          tipo?: string
          tipo_label?: string
        }
        Relationships: []
      }
      dependencias: {
        Row: {
          archivos_activos: number | null
          codigo: string
          color: string
          competencias: string | null
          correo: string
          created_at: string | null
          ext: string | null
          id: string
          jefe: string
          jefe_cargo: string
          nivel: string
          nombre: string
        }
        Insert: {
          archivos_activos?: number | null
          codigo: string
          color?: string
          competencias?: string | null
          correo: string
          created_at?: string | null
          ext?: string | null
          id: string
          jefe: string
          jefe_cargo: string
          nivel: string
          nombre: string
        }
        Update: {
          archivos_activos?: number | null
          codigo?: string
          color?: string
          competencias?: string | null
          correo?: string
          created_at?: string | null
          ext?: string | null
          id?: string
          jefe?: string
          jefe_cargo?: string
          nivel?: string
          nombre?: string
        }
        Relationships: []
      }
      document_responses: {
        Row: {
          content: string
          created_at: string | null
          date: string
          decision: string
          document_id: string | null
          id: string
          radicado: string
          responded_by: string | null
          signed_name: string
          signed_role: string
          subject: string
          template_title: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          date?: string
          decision: string
          document_id?: string | null
          id?: string
          radicado: string
          responded_by?: string | null
          signed_name: string
          signed_role: string
          subject: string
          template_title?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          date?: string
          decision?: string
          document_id?: string | null
          id?: string
          radicado?: string
          responded_by?: string | null
          signed_name?: string
          signed_role?: string
          subject?: string
          template_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_responses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          applicant: string
          applicant_type: string | null
          category: string
          created_at: string | null
          due_date: string
          file_name: string | null
          format: string | null
          id: string
          notes: string | null
          origin_right: string | null
          priority: string
          radicado: string
          response_status: string
          responsible_id: string | null
          size: string | null
          sla_days: number
          status: string
          title: string
          updated_at: string | null
          upload_date: string
        }
        Insert: {
          applicant: string
          applicant_type?: string | null
          category: string
          created_at?: string | null
          due_date: string
          file_name?: string | null
          format?: string | null
          id?: string
          notes?: string | null
          origin_right?: string | null
          priority: string
          radicado: string
          response_status?: string
          responsible_id?: string | null
          size?: string | null
          sla_days?: number
          status?: string
          title: string
          updated_at?: string | null
          upload_date?: string
        }
        Update: {
          applicant?: string
          applicant_type?: string | null
          category?: string
          created_at?: string | null
          due_date?: string
          file_name?: string | null
          format?: string | null
          id?: string
          notes?: string | null
          origin_right?: string | null
          priority?: string
          radicado?: string
          response_status?: string
          responsible_id?: string | null
          size?: string | null
          sla_days?: number
          status?: string
          title?: string
          updated_at?: string | null
          upload_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oficinas: {
        Row: {
          activo: boolean | null
          codigo: string
          created_at: string | null
          email_institucional: string
          id: string
          nombre: string
          titular_cargo: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          email_institucional: string
          id?: string
          nombre: string
          titular_cargo?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          email_institucional?: string
          id?: string
          nombre?: string
          titular_cargo?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          label: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id: string
          label: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      peticion_anexos: {
        Row: {
          created_at: string | null
          es_anexo_oficina: boolean | null
          id: string
          mime_type: string | null
          nombre_archivo: string
          peticion_id: string
          peticion_responsable_id: string | null
          storage_path: string
          subido_por_email: string
          tamano_bytes: number | null
        }
        Insert: {
          created_at?: string | null
          es_anexo_oficina?: boolean | null
          id?: string
          mime_type?: string | null
          nombre_archivo: string
          peticion_id: string
          peticion_responsable_id?: string | null
          storage_path: string
          subido_por_email: string
          tamano_bytes?: number | null
        }
        Update: {
          created_at?: string | null
          es_anexo_oficina?: boolean | null
          id?: string
          mime_type?: string | null
          nombre_archivo?: string
          peticion_id?: string
          peticion_responsable_id?: string | null
          storage_path?: string
          subido_por_email?: string
          tamano_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "peticion_anexos_peticion_id_fkey"
            columns: ["peticion_id"]
            isOneToOne: false
            referencedRelation: "peticiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peticion_anexos_peticion_responsable_id_fkey"
            columns: ["peticion_responsable_id"]
            isOneToOne: false
            referencedRelation: "peticion_responsables"
            referencedColumns: ["id"]
          },
        ]
      }
      peticion_responsables: {
        Row: {
          codigo_acceso: string
          created_at: string | null
          email_enviado_at: string | null
          estado_entrega: string | null
          fecha_entrega: string | null
          fecha_expiracion_codigo: string
          id: string
          observaciones_entrega: string | null
          oficina_id: string
          peticion_id: string
          storage_subfolder_path: string
        }
        Insert: {
          codigo_acceso: string
          created_at?: string | null
          email_enviado_at?: string | null
          estado_entrega?: string | null
          fecha_entrega?: string | null
          fecha_expiracion_codigo: string
          id?: string
          observaciones_entrega?: string | null
          oficina_id: string
          peticion_id: string
          storage_subfolder_path: string
        }
        Update: {
          codigo_acceso?: string
          created_at?: string | null
          email_enviado_at?: string | null
          estado_entrega?: string | null
          fecha_entrega?: string | null
          fecha_expiracion_codigo?: string
          id?: string
          observaciones_entrega?: string | null
          oficina_id?: string
          peticion_id?: string
          storage_subfolder_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "peticion_responsables_oficina_id_fkey"
            columns: ["oficina_id"]
            isOneToOne: false
            referencedRelation: "oficinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peticion_responsables_peticion_id_fkey"
            columns: ["peticion_id"]
            isOneToOne: false
            referencedRelation: "peticiones"
            referencedColumns: ["id"]
          },
        ]
      }
      peticiones: {
        Row: {
          asunto: string
          categoria: string | null
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          estado: string | null
          fecha_limite_entrega: string
          fecha_limite_responsable: string
          fecha_radicacion: string | null
          id: string
          numero_radicado: string
          prioridad: string | null
          solicitante_email: string | null
          solicitante_nombre: string
          solicitante_tipo: string | null
          storage_folder_path: string
          updated_at: string | null
        }
        Insert: {
          asunto: string
          categoria?: string | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_limite_entrega: string
          fecha_limite_responsable: string
          fecha_radicacion?: string | null
          id?: string
          numero_radicado: string
          prioridad?: string | null
          solicitante_email?: string | null
          solicitante_nombre: string
          solicitante_tipo?: string | null
          storage_folder_path: string
          updated_at?: string | null
        }
        Update: {
          asunto?: string
          categoria?: string | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          fecha_limite_entrega?: string
          fecha_limite_responsable?: string
          fecha_radicacion?: string | null
          id?: string
          numero_radicado?: string
          prioridad?: string | null
          solicitante_email?: string | null
          solicitante_nombre?: string
          solicitante_tipo?: string | null
          storage_folder_path?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peticiones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_provisional_password: boolean | null
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_provisional_password?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_provisional_password?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          color: string
          created_at: string | null
          description: string | null
          id: string
          is_protected: boolean | null
          level: number
          level_name: string
          name: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string | null
          description?: string | null
          id: string
          is_protected?: boolean | null
          level: number
          level_name: string
          name: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_protected?: boolean | null
          level?: number
          level_name?: string
          name?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          is_granted: boolean | null
          permission_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          is_granted?: boolean | null
          permission_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          is_granted?: boolean | null
          permission_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_color: string
          created_at: string | null
          dependencia_id: string | null
          email: string
          id: string
          initials: string
          is_active: boolean | null
          name: string
          role_id: string | null
          role_title: string
          updated_at: string | null
        }
        Insert: {
          avatar_color?: string
          created_at?: string | null
          dependencia_id?: string | null
          email: string
          id: string
          initials: string
          is_active?: boolean | null
          name: string
          role_id?: string | null
          role_title: string
          updated_at?: string | null
        }
        Update: {
          avatar_color?: string
          created_at?: string | null
          dependencia_id?: string | null
          email?: string
          id?: string
          initials?: string
          is_active?: boolean | null
          name?: string
          role_id?: string | null
          role_title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_dependencia_id_fkey"
            columns: ["dependencia_id"]
            isOneToOne: false
            referencedRelation: "dependencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_permission: {
        Args: { p_permission_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_log_audit_event: {
        Args: {
          p_action: string
          p_action_type: string
          p_actor_id: string
          p_after?: Json
          p_before?: Json
          p_details: string
          p_entity: string
          p_entity_id: string
          p_severity?: string
        }
        Returns: string
      }
      fn_validar_acceso_portal: {
        Args: { p_codigo: string; p_email: string }
        Returns: Json
      }
      get_dashboard_stats: { Args: never; Returns: Json }
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
